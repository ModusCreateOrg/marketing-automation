import { FullEntity } from "../hubspot/interfaces";
import { RawLicense, RawTransaction } from "../marketplace/raw";

export interface Data {
  tlds: string[];
  licensesWithDataInsights: RawLicense[];
  licensesWithoutDataInsights: RawLicense[];
  transactions: RawTransaction[];
  freeDomains: string[];
  rawDeals: FullEntity[];
  rawCompanies: FullEntity[];
  rawContacts: FullEntity[];
}
