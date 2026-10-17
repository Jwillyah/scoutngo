/*
 * ACKNOWLEDGING THE SOURCE, AND THE ONE TERM OF ITS LICENCE THAT TOUCHES US.
 *
 * The UAS Facility Maps and the Class Airspace layers are published by the FAA
 * as public domain data, with no key and no account. The licence is permissive
 * about the DATA and specific about two things that are not the data: the
 * agency's seal and logos may not be used, and the agency's name may not be
 * used in a way that implies endorsement. So:
 *
 *   the FAA is credited as the source, by name, wherever its data is shown
 *   no FAA seal, logo or other mark appears anywhere in this app
 *   "FAA" is not in the product name and not in any feature name
 *   nothing in the app claims FAA endorsement, approval or affiliation
 *
 * That last line is also why the wording layer never says a flight is
 * approved. Carrying the agency's data and issuing verdicts in its voice would
 * imply exactly the endorsement the licence forbids, quite apart from being
 * false.
 */

export const FAA_SOURCE_NOTE =
  'Airspace and facility map data published by the Federal Aviation Administration. ' +
  'Not endorsed by or affiliated with the FAA.'

/**
 * The FAA's own characterisation of the facility maps, which is the reason the
 * app can show a ceiling at all without that ceiling being a permission.
 */
export const UASFM_INFORMATIONAL =
  'The FAA states these maps do not grant authorization and are informational only. ' +
  'This is what the map says, not an authorization.'

/** Where an actual authorization request goes. */
export const DRONEZONE_URL = 'https://faadronezone.faa.gov/'
