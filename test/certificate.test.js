const path = require('path');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { Certificate } = require('../src');
const { CertificateParsingError } = require('../src/errors');

chai.use(chaiAsPromised);

describe('Testing Certificate', () => {
  it('gets certificate from image', async () => {
    const dcc = await Certificate.fromImage(path.join('test', 'data', 'example_qr_vaccine_recovery.png'));
    chai.expect(dcc.person.standardisedFamilyName).to.be.equal('GANTES');
  });

  it('gets certificate from raw', async () => {
    const dcc = await Certificate.fromRaw('HC1:6BF+70790T9WJWG.FKY*4GO0.O1CV2 O5 N2FBBRW1*70HS8WY04AC*WIFN0AHCD8KD97TK0F90KECTHGWJC0FDC:5AIA%G7X+AQB9746HS80:54IBQF60R6$A80X6S1BTYACG6M+9XG8KIAWNA91AY%67092L4WJCT3EHS8XJC$+DXJCCWENF6OF63W5NW6WF6%JC QE/IAYJC5LEW34U3ET7DXC9 QE-ED8%E.JCBECB1A-:8$96646AL60A60S6Q$D.UDRYA 96NF6L/5QW6307KQEPD09WEQDD+Q6TW6FA7C466KCN9E%961A6DL6FA7D46JPCT3E5JDLA7$Q6E464W5TG6..DX%DZJC6/DTZ9 QE5$CB$DA/D JC1/D3Z8WED1ECW.CCWE.Y92OAGY8MY9L+9MPCG/D5 C5IA5N9$PC5$CUZCY$5Y$527B+A4KZNQG5TKOWWD9FL%I8U$F7O2IBM85CWOC%LEZU4R/BXHDAHN 11$CA5MRI:AONFN7091K9FKIGIY%VWSSSU9%01FO2*FTPQ3C3F');
    chai.expect(dcc.person.standardisedFamilyName).to.be.equal('MUSTERMANN');
  });

  it('gets certificate from invalid image', async () => {
    await chai.expect(Certificate.fromImage(path.join('test', 'data', 'not_valid_certificate.png'))).to.be.rejectedWith(CertificateParsingError);
  });

  it('gets certificate from invalid raw', async () => {
    await chai.expect(Certificate.fromRaw(
      'HC1:6BF+70790T9WJWG.FKY*4GO0.O1CV2 O5 N2FBBRW1*70HS8WY04AC*WIFN0AHCD8KD97TK0F90KECTHGWJC0FDC:5AIA%G7X+AQB9746HS80:54IBQF60R6$A80X6S1BTYACG6M+9XG8KIAWNA91AY%67092L4WJCT3EHS8XJC$+DXJCCWENF6OF63W5NW6WF6%JC QE/IAYJC5LEW34U3ET7DXC9 QE-ED8%E.JCBECB1A-:8$96646AL60A60S6Q$D.UDRYA 96NF6L/5QW6307KQEPD09WEQDD+Q6TW6FA7C466KCN9E%961A6DL6FA7D46JPCT3E5JDLA7$Q6E464W5TG6..DX%DZJC6/DTZ9 QE5$CB$DA/D JC1/D3Z8WCW.CCWE.Y92OAGY8MY9L+9MPCG/D5 C5IA5N9$PC5$CUZCY$5Y$527B+A4KZNQG5TKOWWD9FL%I8U$F7O2IBM85CWOC%LEZU4R/BXHDAHN 11$CA5MRI:AONFN7091K9FKIGIY%VWSSSU9%01FO2*FTPQ3C3F',
    )).to.be.rejectedWith(CertificateParsingError);
  });
  it('gets some invalid certificates', async () => {
    await chai.expect(Certificate.fromImage(path.join('test', 'data', 'not_valid_certificate.png'))).to.be.rejectedWith(CertificateParsingError);
    await chai.expect(Certificate.fromImage(path.join('test', 'data', 'invalid.png'))).to.be.rejectedWith(CertificateParsingError);
  });
});
