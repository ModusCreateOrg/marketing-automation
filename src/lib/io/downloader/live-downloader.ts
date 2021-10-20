import * as hubspot from '@hubspot/api-client';
import * as datadir from '../../cache/datadir.js';
import config, { Pipeline } from '../../config/index.js';
import { contactFromHubspot } from '../../engine/contacts.js';
import { RawLicense, RawTransaction } from "../../model/marketplace/raw";
import { downloadAllTlds, downloadFreeEmailProviders } from '../../services/domains.js';
import Hubspot from '../../services/hubspot.js';
import { downloadLicensesWithDataInsights, downloadLicensesWithoutDataInsights, downloadTransactions } from '../../services/marketplace.js';
import { Company } from '../../types/company.js';
import { Contact } from '../../types/contact.js';
import { Deal } from '../../types/deal.js';
import { SimpleError } from '../../util/errors.js';
import { EntityKind, FullEntity } from '../hubspot.js';
import { Downloader, DownloadLogger } from './downloader.js';


export default class LiveDownloader implements Downloader {

  hubspot = new Hubspot();
  hubspotClient = new hubspot.Client({ apiKey: config.hubspot.apiKey });

  async downloadHubspotEntities(kind: EntityKind, apiProperties: string[], inputAssociations: string[]): Promise<FullEntity[]> {
    const normalizedEntities = await this.hubspot.downloadEntities(kind, apiProperties, inputAssociations);
    save(`${kind}s2.json`, normalizedEntities);
    return normalizedEntities;
  }

  async downloadFreeEmailProviders(downloadLogger: DownloadLogger): Promise<string[]> {
    downloadLogger.prepare(1);
    const domains = await downloadFreeEmailProviders();
    downloadLogger.tick();
    save('domains.json', domains);
    return domains;
  }

  async downloadAllTlds(downloadLogger: DownloadLogger): Promise<string[]> {
    downloadLogger.prepare(1);
    const tlds = await downloadAllTlds();
    downloadLogger.tick();
    save('tlds.json', tlds);
    return tlds;
  }

  async downloadTransactions(downloadLogger: DownloadLogger): Promise<RawTransaction[]> {
    downloadLogger.prepare(1);
    const json: RawTransaction[] = await downloadTransactions();
    downloadLogger.tick();

    save('transactions.json', json);
    return json;
  }

  async downloadLicensesWithoutDataInsights(downloadLogger: DownloadLogger): Promise<RawLicense[]> {
    downloadLogger.prepare(1);
    let json: RawLicense[] = await downloadLicensesWithoutDataInsights();
    downloadLogger.tick();

    save('licenses-without.json', json);
    return json;
  }

  async downloadLicensesWithDataInsights(downloadLogger: DownloadLogger): Promise<RawLicense[]> {
    const licenses = await downloadLicensesWithDataInsights(
      downloadLogger.prepare,
      downloadLogger.tick
    );
    save('licenses-with.json', licenses);
    return licenses;
  }

  async downloadAllCompanies(downloadLogger: DownloadLogger): Promise<Company[]> {
    downloadLogger.prepare(1);
    const properties = [
      'name',
      'type',
    ];

    let companies;
    try { companies = await this.hubspotClient.crm.companies.getAll(undefined, undefined, properties); }
    catch (e: any) {
      throw new Error('Failed downloading companies: ' + e.response.body.message);
    }

    downloadLogger.tick();

    const adjustedCompanies = companies.map(result => ({
      id: result.id,
      name: result.properties.name,
      type: result.properties.type as any,
    }));

    save('companies.json', adjustedCompanies);
    return adjustedCompanies;
  }

  async downloadAllDeals(downloadLogger: DownloadLogger): Promise<Deal[]> {
    downloadLogger.prepare(1);
    const properties = [
      'closedate',
      'deployment',
      config.hubspot.attrs.deal.addonLicenseId,
      config.hubspot.attrs.deal.transactionId,
      'aa_app',
      'license_tier',
      'country',
      'origin',
      'related_products',
      'dealname',
      'dealstage',
      'pipeline',
      'amount',
    ];

    let deals;
    try { deals = await this.hubspotClient.crm.deals.getAll(undefined, undefined, properties, ['contact', 'company']); }
    catch (e: any) {
      throw new Error('Failed downloading deals: ' + e.response.body.message);
    }

    downloadLogger.tick();

    save('deals-raw.json', deals);

    const adjustedDeals = (deals
      .filter(d => d.properties.pipeline === Pipeline.AtlassianMarketplace)
      .map(deal => {
        delete deal.properties.hs_object_id;
        delete deal.properties.hs_lastmodifieddate;
        delete deal.properties.createdate;
        deal.properties.closedate = deal.properties.closedate.substr(0, 10);

        const addonLicenseId = deal.properties[config.hubspot.attrs.deal.addonLicenseId] || '';
        const transactionId = deal.properties[config.hubspot.attrs.deal.transactionId] || '';

        delete deal.properties[config.hubspot.attrs.deal.addonLicenseId];
        delete deal.properties[config.hubspot.attrs.deal.transactionId];

        return ({
          id: deal.id,
          properties: ({
            ...deal.properties,
            addonLicenseId,
            transactionId,
          } as Deal['properties']),
          contactIds: (deal.associations?.contacts.results
            .filter(result => result.type === 'deal_to_contact')
            .map(result => result.id)) || [],
          companyIds: (deal.associations?.companies?.results
            .filter(result => result.type === 'deal_to_company')
            .map(result => result.id)) || [],
        });
      })
    );

    save('deals.json', adjustedDeals);
    return adjustedDeals;
  }

  async downloadAllContacts(downloadLogger: DownloadLogger): Promise<Contact[]> {
    downloadLogger.prepare(1);
    const properties = [
      'email',
      'city',
      'state',
      'country',
      'region',
      'contact_type',
      'hosting',
      'firstname',
      'lastname',
      'phone',
      'deployment',
      'related_products',
      'license_tier',
      'last_mpac_event',
      'hs_additional_emails',
    ];

    let contacts;
    try { contacts = await this.hubspotClient.crm.contacts.getAll(undefined, undefined, properties, ['company']); }
    catch (e: any) {
      const body = e.response.body;
      if (
        (
          typeof body === 'string' && (
            body === 'internal error' ||
            body.startsWith('<!DOCTYPE html>'))
        ) || (
          typeof body === 'object' &&
          body.status === 'error' &&
          body.message === 'internal error'
        )
      ) {
        throw new SimpleError('Hubspot Contacts v3 API had internal error.');
      }
      else {
        throw new Error('Failed downloading contacts: ' + JSON.stringify(body));
      }
    }

    downloadLogger.tick();

    const adjustedContacts = contacts.map(contactFromHubspot);

    save('contacts.json', adjustedContacts);
    return adjustedContacts;
  }

}

function save(file: string, data: unknown) {
  if (config.isProduction) return;

  const content = JSON.stringify(data, null, 2);
  datadir.writeFile('in', file, content);
}
