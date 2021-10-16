const sinon = require('sinon');
const { expect } = require('chai');
const proxyquire = require('proxyquire').noCallThru();

const CAS_FILE_PATH_WITH_SCHEMAS = 'D:\\Games\\Madden NFL 22\\Data\\Win32\\superbundlelayout\\madden_installpackage_00\\cas_03.cas';
const CAS_FILE_PATH_WITHOUT_SCHEMAS = 'D:\\Games\\Madden NFL 22\\Data\\Win32\\superbundlelayout\\madden_installpackage_00\\cas_01.cas';

const M20_CAS_FILE_PATH_WITH_SCHEMAS = 'D:\\Origin\\Madden NFL 20\\Patch\\Win32\\superbundlelayout\\madden_installpackage_00\\cas_01.cas';
const M21_CAS_FILE_PATH_WITH_SCHEMAS = 'D:\\Origin\\Madden NFL 21\\Patch\\Win32\\superbundlelayout\\madden_installpackage_00\\cas_01.cas';

const sampleSchemaReturnValue = {
  meta: {
    gameYear: 22,
    major: 328,
    minor: 1
  },
  data: Buffer.from([0x00])
};

const schemaGenerationServiceSpy = {
  generate: sinon.spy(async function (schema) {
    return sampleSchemaReturnValue;
  })
};

const schemaSearchService = proxyquire('../renderer/js/services/schemaSearchService', {
  './schemaGenerationService': schemaGenerationServiceSpy
});

describe('schema search service unit tests', function () {
  this.timeout(10000);

  beforeEach(() => {
    schemaGenerationServiceSpy.generate.resetHistory();
  });

  it('sends correct data to schema generation service', async () => {
    await schemaSearchService.getSchemasInFile(CAS_FILE_PATH_WITH_SCHEMAS);
    
    expect(schemaGenerationServiceSpy.generate.callCount).to.equal(2);
    expect(schemaGenerationServiceSpy.generate.firstCall.args[0].length).to.equal(695198);
    expect(schemaGenerationServiceSpy.generate.secondCall.args[0].length).to.equal(676373);
  });

  it('returns the expected result', async () => {
    const schemas = await schemaSearchService.getSchemasInFile(CAS_FILE_PATH_WITH_SCHEMAS);

    const expectedReturnValue = {
      meta: {
        gameYear: 22,
        major: 328,
        minor: 1,
        fileExtension: '.gz'
      },
      data: Buffer.from([0x00])
    }

    expect(schemas.length).to.equal(2);
    expect(schemas[0]).to.eql(expectedReturnValue);
    expect(schemas[1]).to.eql(expectedReturnValue);
  });

  it('returns no schemas if the CAS file doesnt have any', async () => {
    const schemas = await schemaSearchService.getSchemasInFile(CAS_FILE_PATH_WITHOUT_SCHEMAS);

    expect(schemas.length).to.equal(0);
  });

  it('M21', async () => {
    const schemas = await schemaSearchService.getSchemasInFile(M21_CAS_FILE_PATH_WITH_SCHEMAS);
    expect(schemas.length).to.equal(2);
  });

  it('M20', async () => {
    const schemas = await schemaSearchService.getSchemasInFile(M20_CAS_FILE_PATH_WITH_SCHEMAS);
    expect(schemas.length).to.equal(1);
  });
});