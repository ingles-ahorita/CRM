// Phone number country detection utility
// This is a simplified version - for production, consider using a library like libphonenumber-js

const COUNTRY_CODES = {
  // North America
  '1': 'US/CA', // United States/Canada
  '1242': 'BS', // Bahamas
  '1246': 'BB', // Barbados
  '1264': 'AI', // Anguilla
  '1268': 'AG', // Antigua and Barbuda
  '1284': 'VG', // British Virgin Islands
  '1340': 'VI', // US Virgin Islands
  '1345': 'KY', // Cayman Islands
  '1473': 'GD', // Grenada
  '1649': 'TC', // Turks and Caicos
  '1664': 'MS', // Montserrat
  '1670': 'MP', // Northern Mariana Islands
  '1671': 'GU', // Guam
  '1684': 'AS', // American Samoa
  '1721': 'SX', // Sint Maarten
  '1758': 'LC', // Saint Lucia
  '1784': 'VC', // Saint Vincent and the Grenadines
  '1787': 'PR', // Puerto Rico
  '1809': 'DO', // Dominican Republic
  '1829': 'DO', // Dominican Republic
  '1849': 'DO', // Dominican Republic
  '1868': 'TT', // Trinidad and Tobago
  '1869': 'KN', // Saint Kitts and Nevis
  '1876': 'JM', // Jamaica

  // Europe
  '30': 'GR', // Greece
  '31': 'NL', // Netherlands
  '32': 'BE', // Belgium
  '33': 'FR', // France
  '34': 'ES', // Spain
  '36': 'HU', // Hungary
  '39': 'IT', // Italy
  '40': 'RO', // Romania
  '41': 'CH', // Switzerland
  '43': 'AT', // Austria
  '44': 'GB', // United Kingdom
  '45': 'DK', // Denmark
  '46': 'SE', // Sweden
  '47': 'NO', // Norway
  '48': 'PL', // Poland
  '49': 'DE', // Germany
  '351': 'PT', // Portugal
  '352': 'LU', // Luxembourg
  '353': 'IE', // Ireland
  '354': 'IS', // Iceland
  '355': 'AL', // Albania
  '356': 'MT', // Malta
  '357': 'CY', // Cyprus
  '358': 'FI', // Finland
  '359': 'BG', // Bulgaria
  '370': 'LT', // Lithuania
  '371': 'LV', // Latvia
  '372': 'EE', // Estonia
  '373': 'MD', // Moldova
  '374': 'AM', // Armenia
  '375': 'BY', // Belarus
  '376': 'AD', // Andorra
  '377': 'MC', // Monaco
  '378': 'SM', // San Marino
  '380': 'UA', // Ukraine
  '381': 'RS', // Serbia
  '382': 'ME', // Montenegro
  '383': 'XK', // Kosovo
  '385': 'HR', // Croatia
  '386': 'SI', // Slovenia
  '387': 'BA', // Bosnia and Herzegovina
  '389': 'MK', // North Macedonia

  // Asia
  '60': 'MY', // Malaysia
  '61': 'AU', // Australia
  '62': 'ID', // Indonesia
  '63': 'PH', // Philippines
  '64': 'NZ', // New Zealand
  '65': 'SG', // Singapore
  '66': 'TH', // Thailand
  '81': 'JP', // Japan
  '82': 'KR', // South Korea
  '84': 'VN', // Vietnam
  '86': 'CN', // China
  '90': 'TR', // Turkey
  '91': 'IN', // India
  '92': 'PK', // Pakistan
  '93': 'AF', // Afghanistan
  '94': 'LK', // Sri Lanka
  '95': 'MM', // Myanmar
  '98': 'IR', // Iran

  // Latin America
  '52': 'MX', // Mexico
  '54': 'AR', // Argentina
  '55': 'BR', // Brazil
  '56': 'CL', // Chile
  '57': 'CO', // Colombia
  '58': 'VE', // Venezuela
  '591': 'BO', // Bolivia
  '592': 'GY', // Guyana
  '593': 'EC', // Ecuador
  '594': 'GF', // French Guiana
  '595': 'PY', // Paraguay
  '596': 'MQ', // Martinique
  '597': 'SR', // Suriname
  '598': 'UY', // Uruguay

  // Africa
  '20': 'EG', // Egypt
  '27': 'ZA', // South Africa
  '212': 'MA', // Morocco
  '213': 'DZ', // Algeria
  '216': 'TN', // Tunisia
  '218': 'LY', // Libya
  '220': 'GM', // Gambia
  '221': 'SN', // Senegal
  '222': 'MR', // Mauritania
  '223': 'ML', // Mali
  '224': 'GN', // Guinea
  '225': 'CI', // Côte d'Ivoire
  '226': 'BF', // Burkina Faso
  '227': 'NE', // Niger
  '228': 'TG', // Togo
  '229': 'BJ', // Benin
  '230': 'MU', // Mauritius
  '231': 'LR', // Liberia
  '232': 'SL', // Sierra Leone
  '233': 'GH', // Ghana
  '234': 'NG', // Nigeria
  '235': 'TD', // Chad
  '236': 'CF', // Central African Republic
  '237': 'CM', // Cameroon
  '238': 'CV', // Cape Verde
  '239': 'ST', // São Tomé and Príncipe
  '240': 'GQ', // Equatorial Guinea
  '241': 'GA', // Gabon
  '242': 'CG', // Republic of the Congo
  '243': 'CD', // Democratic Republic of the Congo
  '244': 'AO', // Angola
  '245': 'GW', // Guinea-Bissau
  '246': 'IO', // British Indian Ocean Territory
  '248': 'SC', // Seychelles
  '249': 'SD', // Sudan
  '250': 'RW', // Rwanda
  '251': 'ET', // Ethiopia
  '252': 'SO', // Somalia
  '253': 'DJ', // Djibouti
  '254': 'KE', // Kenya
  '255': 'TZ', // Tanzania
  '256': 'UG', // Uganda
  '257': 'BI', // Burundi
  '258': 'MZ', // Mozambique
  '259': 'ZM', // Zambia
  '260': 'ZW', // Zimbabwe
  '261': 'MG', // Madagascar
  '262': 'RE', // Réunion
  '263': 'ZW', // Zimbabwe
  '264': 'NA', // Namibia
  '265': 'MW', // Malawi
  '266': 'LS', // Lesotho
  '267': 'BW', // Botswana
  '268': 'SZ', // Eswatini
  '269': 'KM', // Comoros
  '290': 'SH', // Saint Helena
  '291': 'ER', // Eritrea
  '297': 'AW', // Aruba
  '298': 'FO', // Faroe Islands
  '299': 'GL', // Greenland

  // Middle East
  '966': 'SA', // Saudi Arabia
  '971': 'AE', // UAE
  '972': 'IL', // Israel
  '973': 'BH', // Bahrain
  '974': 'QA', // Qatar
  '975': 'BT', // Bhutan
  '976': 'MN', // Mongolia
  '977': 'NP', // Nepal
  '992': 'TJ', // Tajikistan
  '993': 'TM', // Turkmenistan
  '994': 'AZ', // Azerbaijan
  '995': 'GE', // Georgia
  '996': 'KG', // Kyrgyzstan
  '998': 'UZ', // Uzbekistan
};

// Clean phone number by removing all non-digit characters
function cleanPhoneNumber(phone) {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}

// Extract country code from phone number
function extractCountryCode(phone) {
  const cleaned = cleanPhoneNumber(phone);
  if (!cleaned) return null;

  // Check for longer codes first (up to 4 digits)
  for (let length = 4; length >= 1; length--) {
    const code = cleaned.substring(0, length);
    if (COUNTRY_CODES[code]) {
      return {
        code: code,
        country: COUNTRY_CODES[code],
        remaining: cleaned.substring(length)
      };
    }
  }

  return null;
}

// Get country from phone number
export function getCountryFromPhone(phone) {
  if (!phone) return 'Unknown';
  
  const countryData = extractCountryCode(phone);
  if (!countryData) return 'Unknown';
  
  return countryData.country;
}

// Get country code from phone number
export function getCountryCodeFromPhone(phone) {
  if (!phone) return null;
  
  const countryData = extractCountryCode(phone);
  if (!countryData) return null;
  
  return countryData.code;
}

// Get full country info from phone number
export function getCountryInfoFromPhone(phone) {
  if (!phone) return { country: 'Unknown', code: null, remaining: null };
  
  const countryData = extractCountryCode(phone);
  if (!countryData) return { country: 'Unknown', code: null, remaining: null };
  
  return {
    country: countryData.country,
    code: countryData.code,
    remaining: countryData.remaining
  };
}

// Validate if phone number looks valid for a country
export function isValidPhoneForCountry(phone, expectedCountry) {
  const countryInfo = getCountryInfoFromPhone(phone);
  return countryInfo.country === expectedCountry;
}
