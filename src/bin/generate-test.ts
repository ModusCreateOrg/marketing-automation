import 'source-map-support/register';
import util from 'util';
import { engineConfigFromENV } from '../lib/config/env';
import { cliArgs } from '../lib/config/params';
import { dataManager } from '../lib/data/manager';
import { Engine } from "../lib/engine";
import { Hubspot } from '../lib/hubspot';
import { ConsoleLogger } from '../lib/log/console';
import { Marketplace } from '../lib/marketplace';
import { License } from '../lib/model/license';
import { abbrActionDetails, abbrEventDetails, abbrRecordDetails } from '../tests/deal-generator/utils';

function TEMPLATE({ runDealGenerator, RECORDS, EVENTS, ACTIONS }: any) {
  it(`describe test`, () => {
    const { events, actions } = runDealGenerator({
      records: RECORDS,
    });
    expect(events).toEqual(EVENTS);
    expect(actions).toEqual(ACTIONS);
  });
}

function main(template: string, licenseIds: string[]) {
  const engine = new Engine(Hubspot.fromENV(), Marketplace.fromENV(), engineConfigFromENV(), new ConsoleLogger());
  const { data } = dataManager.latestDataSet();
  const { dealGeneratorResults } = engine.run(data);

  for (const licenseId of licenseIds) {
    const results = dealGeneratorResults.get(licenseId);
    if (results) {
      const { actions, records, events } = results;
      const licenses = records.filter(r => r instanceof License) as License[];
      console.log(`\n\n---\n\n`)
      console.log(template
        .replace('RECORDS', format(licenses.map(abbrRecordDetails), 100))
        .replace('EVENTS', format(events.map(abbrEventDetails)))
        .replace('ACTIONS', format(actions.map(abbrActionDetails)))
      );
    }
    else {
      console.log(`Can't find results for ${licenseId}`);
    }
  }
}

function format(o: any, breakLength = 50) {
  return util.inspect(o, {
    depth: null,
    breakLength,
    maxArrayLength: null,
    maxStringLength: null,
  });
}

const template = (TEMPLATE
  .toString()
  .split(/\n/g)
  .slice(1, -1)
  .join('\n'));

main(template, cliArgs);
