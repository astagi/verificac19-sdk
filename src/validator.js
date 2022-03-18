const rs = require('jsrsasign');

const { addHours, addDays } = require('./utils');
const { CertificateVerificationError } = require('./errors');

const Service = require('./service');

// Generic Type parameter
const GENERIC_TYPE = 'GENERIC';

// Test Result
const TEST_DETECTED = '260373001';

// Test Types
const TEST_RAPID = 'LP217198-3';
const TEST_MOLECULAR = 'LP6464-4';

// Vaccine Types
const JOHNSON = 'EU/1/20/1525';
const SPUTNIK = 'Sputnik-V';
const MODERNA = 'EU/1/20/1507';
const PFIZER = 'EU/1/20/1528';
const ASTRAZENECA = 'EU/1/21/1529';
const COVISHIELD = 'Covishield';
const R_COVI = 'R-COVI';
const COVID19_RECOMBINANT = 'Covid-19-recombinant';

const VACCINES_EMA_LIST = [JOHNSON, MODERNA, PFIZER, ASTRAZENECA, COVISHIELD, R_COVI, COVID19_RECOMBINANT];

// Vaccination status
const VACCINATION_STATUS = {
  NOT_COMPLETE: 'Not complete',
  COMPLETE: 'Complete',
  BOOSTER: 'Booster',
};

// OID Recovery Types
const OID_RECOVERY = '1.3.6.1.4.1.1847.2021.1.3';
const OID_ALT_RECOVERY = '1.3.6.1.4.1.0.1847.2021.1.3';

// Countries
const ITALY = 'IT';
const SAN_MARINO = 'SM';

// Certificate Status
const NOT_EU_DCC = 'NOT_EU_DCC';
const NOT_VALID = 'NOT_VALID';
const NOT_VALID_YET = 'NOT_VALID_YET';
const VALID = 'VALID';
const REVOKED = 'REVOKED';
const TEST_NEEDED = 'TEST_NEEDED';

// Validation mode
const SUPER_DGP = '2G';
const NORMAL_DGP = '3G';
const BOOSTER_DGP = 'BOOSTER';
const VISITORS_RSA_DGP = BOOSTER_DGP;
const WORK_DGP = 'WORK';
const ENTRY_IT_DGP = 'ENTRY_IT';

const codes = {
  VALID,
  NOT_VALID,
  NOT_VALID_YET,
  NOT_EU_DCC,
  REVOKED,
  TEST_NEEDED,
};

const modalities = {
  SUPER_DGP,
  NORMAL_DGP,
  BOOSTER_DGP,
  VISITORS_RSA_DGP,
  WORK_DGP,
  ENTRY_IT_DGP,
};

const isVaccineInEmaList = (vaccine) => VACCINES_EMA_LIST.includes(vaccine);

const hasOwner50years = (certificate, scanDate) => {
  const now = new Date(scanDate);
  now.setUTCHours(0, 0, 0, 0);
  const dob = new Date(certificate.dateOfBirth);
  dob.setUTCHours(0, 0, 0, 1);
  return (new Date(new Date(now) - dob)).getUTCFullYear() - 1970 >= 50;
};

const findProperty = (rules, name, type) => rules.find((element) => {
  const propertyType = !type ? GENERIC_TYPE : type;
  return element.name === name && element.type === propertyType;
});

const clearExtraTime = (strDateTime) => {
  try {
    if (strDateTime.contains('T')) {
      return strDateTime.substring(0, strDateTime.indexOf('T'));
    }
    return strDateTime;
  } catch {
    return strDateTime;
  }
};

const getInfoFromCertificate = async (certificate) => {
  const signatures = await Service.getCurrentCacheManager().getSignatures();
  const info = { country: null, oid: null };
  try {
    const x509 = new rs.X509();
    x509.readCertPEM(signatures[certificate.kid]);
    const certIssuer = x509.getIssuer().array[0].find((el) => el.type === 'C');
    const country = certIssuer ? certIssuer.value : null;
    const extendedKeyUsage = country === ITALY ? x509.getExtExtKeyUsageName() : null;
    info.country = country;
    info.oid = extendedKeyUsage ? extendedKeyUsage[0] : null;
  } catch {
    // Possible error parsing certificate
  }
  return info;
};

const checkVaccinations = (certificate, rules, mode) => {
  try {
    const last = certificate.vaccinations[certificate.vaccinations.length - 1];
    const type = last.medicinalProduct;
    const isItalian = last.countryOfVaccination === ITALY;
    const isEMA = isVaccineInEmaList(type) || (type === SPUTNIK && last.countryOfVaccination === SAN_MARINO);
    let vaccinationStatus;

    // Check vaccine type is not empty
    if (!type) {
      return {
        code: NOT_VALID,
        message: 'Vaccine Type is empty',
      };
    }

    const doses = `Doses ${last.doseNumber}/${last.totalSeriesOfDoses}`;

    if (last.doseNumber <= 0) {
      return {
        code: NOT_VALID,
        message: `${doses} - Invalid number of doses`,
      };
    }

    const startNow = new Date(Date.now());
    const endNow = new Date(Date.now());

    startNow.setUTCHours(0, 0, 0, 0);
    endNow.setUTCHours(23, 59, 59, 999);

    let startDate = new Date(
      Date.parse(clearExtraTime(last.dateOfVaccination)),
    );
    let endDate = new Date(Date.parse(clearExtraTime(last.dateOfVaccination)));

    // Check if Not complete
    if (last.doseNumber < last.totalSeriesOfDoses) {
      vaccinationStatus = VACCINATION_STATUS.NOT_COMPLETE;
    }

    // Check if Complete
    if (last.doseNumber >= last.totalSeriesOfDoses) {
      if ((type === JOHNSON) && ((last.doseNumber > last.totalSeriesOfDoses) || (last.doseNumber === last.totalSeriesOfDoses && last.doseNumber >= 2))) {
        startDate = new Date(
          Date.parse(clearExtraTime(last.dateOfVaccination)),
        );
      }
      vaccinationStatus = VACCINATION_STATUS.COMPLETE;
      // Check if Booster
      if (type === JOHNSON) {
        if (last.doseNumber >= last.totalSeriesOfDoses && last.doseNumber >= 2) {
          vaccinationStatus = VACCINATION_STATUS.BOOSTER;
        }
      } else if (last.doseNumber >= last.totalSeriesOfDoses && last.doseNumber >= 3) {
        vaccinationStatus = VACCINATION_STATUS.BOOSTER;
      }
    }

    // Here I have `mode`, `vaccinationStatus` and `isItalian`
    let vaccineStartDay; let vaccineEndDay; let
      vaccineEndDayExtended;
    let testRequired = false;

    if (mode === NORMAL_DGP) { // NORMAL DGP
      if (!isEMA) {
        return {
          code: NOT_VALID,
          message: 'Vaccine is not EMA',
        };
      }
      if (vaccinationStatus === VACCINATION_STATUS.NOT_COMPLETE) {
        vaccineStartDay = findProperty(
          rules,
          'vaccine_start_day_not_complete',
          type,
        );
        vaccineEndDay = findProperty(
          rules,
          'vaccine_end_day_not_complete',
          type,
        );
      } else if (vaccinationStatus === VACCINATION_STATUS.COMPLETE) {
        vaccineStartDay = findProperty(
          rules,
          'vaccine_start_day_complete_IT',
        );
        vaccineEndDay = findProperty(
          rules,
          'vaccine_end_day_complete_IT',
        );
      } else if (vaccinationStatus === VACCINATION_STATUS.BOOSTER) {
        vaccineStartDay = findProperty(
          rules,
          'vaccine_start_day_booster_IT',
        );
        vaccineEndDay = findProperty(
          rules,
          'vaccine_end_day_booster_IT',
        );
      }
    } else if (mode === ENTRY_IT_DGP) { // ENTRY ITALY DGP
      if (!isEMA) {
        return {
          code: NOT_VALID,
          message: 'Vaccine is not EMA',
        };
      }
      if (vaccinationStatus === VACCINATION_STATUS.NOT_COMPLETE) {
        return {
          code: NOT_VALID,
          message: 'Required complete vaccination to travel to Italy',
        };
      }
      if (vaccinationStatus === VACCINATION_STATUS.COMPLETE) {
        vaccineStartDay = findProperty(
          rules,
          'vaccine_start_day_complete_NOT_IT',
        );
        vaccineEndDay = findProperty(
          rules,
          'vaccine_end_day_complete_NOT_IT',
        );
      } else if (vaccinationStatus === VACCINATION_STATUS.BOOSTER) {
        vaccineStartDay = findProperty(
          rules,
          'vaccine_start_day_booster_NOT_IT',
        );
        vaccineEndDay = findProperty(
          rules,
          'vaccine_end_day_booster_NOT_IT',
        );
      }
    } else if (mode === SUPER_DGP) { // SUPER DGP
      if (!isEMA && vaccinationStatus === VACCINATION_STATUS.NOT_COMPLETE) {
        return {
          code: NOT_VALID,
          message: 'Vaccine not complete and not EMA',
        };
      }
      if (vaccinationStatus === VACCINATION_STATUS.NOT_COMPLETE) {
        vaccineStartDay = findProperty(
          rules,
          'vaccine_start_day_not_complete',
          type,
        );
        vaccineEndDay = findProperty(
          rules,
          'vaccine_end_day_not_complete',
          type,
        );
      } else if (vaccinationStatus === VACCINATION_STATUS.COMPLETE) {
        vaccineStartDay = findProperty(
          rules,
          'vaccine_start_day_complete_IT',
        );
        vaccineEndDay = findProperty(
          rules,
          'vaccine_end_day_complete_IT',
        );
        // If !isItalian || !isEMA extends it with `vaccine_end_day_complete_extended_EMA` (GENERIC) and force TEST
        if (!isItalian || !isEMA) {
          vaccineEndDayExtended = findProperty(
            rules,
            'vaccine_end_day_complete_extended_EMA',
          );
        }
        if (!isEMA) {
          testRequired = true;
        }
      } else if (vaccinationStatus === VACCINATION_STATUS.BOOSTER) {
        vaccineStartDay = findProperty(
          rules,
          'vaccine_start_day_booster_IT',
        );
        vaccineEndDay = findProperty(
          rules,
          'vaccine_end_day_booster_IT',
        );
        // If !isEMA force TEST
        if (!isEMA) {
          testRequired = true;
        }
      }
    } else if (mode === VISITORS_RSA_DGP) { // VISITORS DGP
      if (vaccinationStatus === VACCINATION_STATUS.NOT_COMPLETE) {
        return {
          code: NOT_VALID,
          message: 'Required complete vaccination',
        };
      }
      if (vaccinationStatus === VACCINATION_STATUS.COMPLETE) {
        vaccineStartDay = findProperty(
          rules,
          'vaccine_start_day_complete_IT',
        );
        vaccineEndDay = findProperty(
          rules,
          'vaccine_end_day_complete_IT',
        );
        // Force TEST
        testRequired = true;
      } else if (vaccinationStatus === VACCINATION_STATUS.BOOSTER) {
        vaccineStartDay = findProperty(
          rules,
          'vaccine_start_day_booster_IT',
        );
        vaccineEndDay = findProperty(
          rules,
          'vaccine_end_day_booster_IT',
        );
        // If !isEMA force TEST
        if (!isEMA) {
          testRequired = true;
        }
      }
    } else if (mode === WORK_DGP) { // WORK DGP
      // If !hasOwner50years && !isEMA Not Valid
      if (!hasOwner50years(certificate, startDate) && !isEMA) {
        return {
          code: NOT_VALID,
          message: 'Not EMA vaccine is not valid for worker with age < 50 years',
        };
      }
      if (vaccinationStatus === VACCINATION_STATUS.NOT_COMPLETE) {
        if (!isEMA) {
          return {
            code: NOT_VALID,
            message: 'Vaccine not complete and not EMA',
          };
        }
        vaccineStartDay = findProperty(
          rules,
          'vaccine_start_day_not_complete',
          type,
        );
        vaccineEndDay = findProperty(
          rules,
          'vaccine_end_day_not_complete',
          type,
        );
      } else if (vaccinationStatus === VACCINATION_STATUS.COMPLETE) {
        vaccineStartDay = findProperty(
          rules,
          'vaccine_start_day_complete_IT',
        );
        vaccineEndDay = findProperty(
          rules,
          'vaccine_end_day_complete_IT',
        );

        // If hasOwner50years && !isItalian extends it with `vaccine_end_day_complete_extended_EMA` (GENERIC) and force TEST
        if (hasOwner50years(certificate, startDate) && !isItalian) {
          vaccineEndDayExtended = findProperty(
            rules,
            'vaccine_end_day_complete_extended_EMA',
          );
        }
        // If hasOwner50years && !isEMA Not Valid extends it with `vaccine_end_day_complete_extended_EMA` (GENERIC) and force TEST
        if (hasOwner50years(certificate, startDate) && !isEMA) {
          vaccineEndDayExtended = findProperty(
            rules,
            'vaccine_end_day_complete_extended_EMA',
          );
          testRequired = true;
        }
      } else if (vaccinationStatus === VACCINATION_STATUS.BOOSTER) {
        vaccineStartDay = findProperty(
          rules,
          'vaccine_start_day_booster_IT',
        );
        vaccineEndDay = findProperty(
          rules,
          'vaccine_end_day_booster_IT',
        );
      }
    }

    // Check validity

    startDate = addDays(startDate, vaccineStartDay.value);
    endDate = addDays(endDate, vaccineEndDay.value);

    // Not valid yet
    if (startDate > endNow) {
      return {
        code: NOT_VALID_YET,
        message:
          `${doses
          } - Vaccination is not valid yet, starts at : ${
            startDate.toISOString()}`,
      };
    }

    // Valid only if no test is required
    if (endNow <= endDate) {
      if (testRequired) {
        return {
          code: TEST_NEEDED,
          message: 'Test needed',
        };
      }
      return {
        code: VALID,
        message:
            `${doses
            } - Vaccination is valid [ ${
              startDate.toISOString()
            } - ${
              endDate.toISOString()
            } ] `,
      };
    }

    // Test needed in case of extension
    if (vaccineEndDayExtended && endNow < addDays(endDate, vaccineEndDayExtended.value)) {
      return {
        code: TEST_NEEDED,
        message: 'Test needed',
      };
    }

    // Not valid if expired
    if (startNow > endDate) {
      return {
        code: NOT_VALID,
        message:
          `${doses} - Vaccination is expired at : ${endDate.toISOString()}`,
      };
    }
    return { code: NOT_VALID, message: 'Vaccination format is invalid' };
  } catch (err) {
    return {
      code: NOT_EU_DCC,
      message:
        `Vaccination is not present or is not a green pass : ${err.toString()}`,
    };
  }
};

const checkTests = (certificate, rules, mode) => {
  const now = new Date(Date.now());
  if (mode === BOOSTER_DGP || mode === SUPER_DGP) {
    return {
      result: false,
      code: NOT_VALID,
      message: 'Not valid. Super DGP or Booster required.',
    };
  }
  if (mode === WORK_DGP && hasOwner50years(certificate, now)) {
    return {
      result: false,
      code: NOT_VALID,
      message: 'Not valid for workers with age >= 50 years.',
    };
  }
  try {
    let testStartHours;
    let testEndHours;

    const last = certificate.tests[certificate.tests.length - 1];
    if (last.typeOfTest === TEST_MOLECULAR) {
      testStartHours = findProperty(rules, 'molecular_test_start_hours');
      testEndHours = findProperty(rules, 'molecular_test_end_hours');
    } else if (last.typeOfTest === TEST_RAPID) {
      testStartHours = findProperty(rules, 'rapid_test_start_hours');
      testEndHours = findProperty(rules, 'rapid_test_end_hours');
    } else {
      return { code: NOT_VALID, message: 'Test type is not valid' };
    }

    let startDate = new Date(Date.parse(last.dateTimeOfCollection));
    let endDate = new Date(Date.parse(last.dateTimeOfCollection));

    startDate = addHours(startDate, testStartHours.value);
    endDate = addHours(endDate, testEndHours.value);

    if (last.testResult === TEST_DETECTED) return { code: NOT_VALID, message: 'Test Result is DETECTED' };

    if (startDate > now) {
      return {
        code: NOT_VALID_YET,
        message:
          `Test Result is not valid yet, starts at : ${
            startDate.toISOString()}`,
      };
    }

    if (now > endDate) {
      return {
        code: NOT_VALID,
        message: `Test Result is expired at : ${endDate.toISOString()}`,
      };
    }

    return {
      code: VALID,
      message:
        `Test Result is valid [ ${
          startDate.toISOString()
        } - ${
          endDate.toISOString()
        } ] `,
    };
  } catch (err) {
    return {
      code: NOT_EU_DCC,
      message:
        `Test Result is not present or is not a green pass : ${err.toString()}`,
    };
  }
};

const checkRecovery = (certificate, rules, mode) => {
  try {
    const certificateInfo = getInfoFromCertificate(certificate);
    const settingStartRecovery = mode === ENTRY_IT_DGP ? 'recovery_cert_start_day_NOT_IT' : 'recovery_cert_start_day_IT';
    const settingEndRecovery = mode === ENTRY_IT_DGP ? 'recovery_cert_end_day_NOT_IT' : 'recovery_cert_end_day_IT';
    const isRecoveryBis = certificateInfo.country === ITALY && [OID_RECOVERY, OID_ALT_RECOVERY].includes(certificateInfo.oid);
    const recoveryCertStartDay = findProperty(rules, isRecoveryBis ? 'recovery_pv_cert_start_day' : settingStartRecovery);
    const recoveryCertEndDay = findProperty(rules, isRecoveryBis ? 'recovery_pv_cert_end_day' : settingEndRecovery);

    const last = certificate.recoveryStatements[certificate.recoveryStatements.length - 1];

    const now = new Date(Date.now());
    const startDate = new Date(
      Date.parse(clearExtraTime(last.certificateValidFrom)),
    );
    const endDate = new Date(
      Date.parse(clearExtraTime(last.certificateValidUntil)),
    );

    const startDateValidation = addDays(startDate, recoveryCertStartDay.value);

    if (startDateValidation > now) {
      return {
        code: NOT_VALID_YET,
        message:
          `Recovery statement is not valid yet, starts at : ${
            startDate.toISOString()}`,
      };
    }

    if (now > addDays(startDateValidation, recoveryCertEndDay.value)) {
      return {
        code: NOT_VALID,
        message: `Recovery statement is expired at : ${endDate.toISOString()}`,
      };
    }

    if (mode === BOOSTER_DGP && !isRecoveryBis) {
      return {
        code: TEST_NEEDED,
        message: 'Test needed',
      };
    }

    return {
      code: VALID,
      message:
        `Recovery statement is valid [ ${
          startDate.toISOString()
        } - ${
          endDate.toISOString()
        } ] `,
    };
  } catch (err) {
    return {
      code: NOT_EU_DCC,
      message: `Recovery statement is not present or is not a green pass : ${err.toString()}`,
    };
  }
};

const checkExemption = (certificate, rules, mode) => {
  try {
    if (mode === BOOSTER_DGP) {
      return {
        code: TEST_NEEDED,
        message: 'Test needed',
      };
    }
    if (mode === ENTRY_IT_DGP) {
      return {
        code: NOT_VALID,
        message: 'Exemption is not valid',
      };
    }
    const last = certificate.exemptions[certificate.exemptions.length - 1];

    const now = new Date(Date.now());
    const startDate = new Date(
      Date.parse(clearExtraTime(last.certificateValidFrom)),
    );
    const endDate = new Date(
      Date.parse(clearExtraTime(last.certificateValidUntil)),
    );
    if (startDate > now) {
      return {
        code: NOT_VALID_YET,
        message:
          `Exemption is not valid yet, starts at : ${
            startDate.toISOString()}`,
      };
    }
    if (now > endDate) {
      return {
        code: NOT_VALID,
        message: `Exemption is expired at : ${endDate.toISOString()}`,
      };
    }
    return {
      code: VALID,
      message:
        `Exemption is valid [ ${
          startDate.toISOString()
        } - ${
          endDate.toISOString()
        } ] `,
    };
  } catch (err) {
    return {
      code: NOT_EU_DCC,
      message: `Exemption is not present or is not a green pass : ${err.toString()}`,
    };
  }
};

const checkUVCI = async (r, UVCIList) => {
  if (r) {
    for (const op of r) {
      if (UVCIList.includes(op.certificateIdentifier)) {
        return false;
      }
      if (await Service.getCurrentCacheManager().isUVCIRevoked(op.certificateIdentifier)) {
        return false;
      }
    }
  }
  return true;
};

const checkCacheIsReady = async () => {
  if (!(await Service.getCurrentCacheManager().isReady())) {
    throw new CertificateVerificationError('Cache is not ready!');
  }
};

const checkRules = async (certificate, mode = NORMAL_DGP) => {
  await Service.getCurrentCacheManager().checkCacheManagerSetUp();
  await checkCacheIsReady();
  const rules = await Service.getCurrentCacheManager().getRules();
  const UVCIList = findProperty(
    rules,
    'black_list_uvci',
    'black_list_uvci',
  ).value.split(';').filter((uvci) => uvci !== '');

  const isRevoked = !await checkUVCI(certificate.vaccinations || certificate.exemptions || certificate.tests || certificate.recoveryStatements, UVCIList);

  if (isRevoked) {
    await Service.getCurrentCacheManager().tearDown();
    return {
      result: false,
      code: REVOKED,
      message: 'UVCI is in blacklist',
    };
  }

  let result;

  if (certificate.vaccinations) {
    result = checkVaccinations(certificate, rules, mode);
  } else if (certificate.tests) {
    result = checkTests(certificate, rules, mode);
  } else if (certificate.recoveryStatements) {
    result = checkRecovery(certificate, rules, mode);
  } else if (certificate.exemptions) {
    result = checkExemption(certificate, rules, mode);
  } else {
    await Service.getCurrentCacheManager().tearDown();
    return {
      result: false,
      code: NOT_EU_DCC,
      message: 'No vaccination, test, exemption or recovery statement found in payload',
    };
  }
  await Service.getCurrentCacheManager().tearDown();
  return {
    result: result.code === VALID,
    code: result.code,
    message: result.message,
  };
};

const checkSignature = async (certificate) => {
  await Service.getCurrentCacheManager().checkCacheManagerSetUp();
  await checkCacheIsReady();
  const signaturesList = await Service.getCurrentCacheManager().getSignatureList();
  const signatures = await Service.getCurrentCacheManager().getSignatures();
  let verified = false;
  if (certificate.kid && signaturesList.includes(certificate.kid)) {
    try {
      verified = await certificate.dcc.checkSignatureWithCertificate(signatures[certificate.kid]);
    } catch {
      // invalid signature or key, return false
    }
  }
  await Service.getCurrentCacheManager().tearDown();
  return !!verified;
};

const buildResponse = (certificate, rulesResult, signatureOk) => {
  let motivation = rulesResult;
  if (!signatureOk) {
    motivation = {
      code: NOT_VALID,
      result: false,
      message: 'Invalid signature',
    };
  }
  return {
    person: certificate.person ? `${certificate.person.givenName} ${certificate.person.familyName}` : null,
    date_of_birth: certificate.dateOfBirth ? certificate.dateOfBirth : null,
    ...motivation,
  };
};

async function validate(certificate, mode = NORMAL_DGP) {
  const signatureOk = await checkSignature(certificate);
  const rulesResult = await checkRules(certificate, mode);
  return buildResponse(certificate, rulesResult, signatureOk);
}

module.exports = {
  checkSignature, checkRules, validate, codes, mode: modalities,
};
