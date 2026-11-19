const path = require('path');

const BASE_DIRS = {
    m22: path.join(__dirname, '../../data/m22'),
    c27: path.join(__dirname, '../../data/c27')
};

module.exports = {
    c27: {
        base: BASE_DIRS.c27,
        dynasty: {
            // Only opened, never saved, so tests can share it.
            test: path.join(BASE_DIRS.c27, 'dynasty/test/DYNASTY-E2ETEST')
        }
    },
    m22: {
        base: BASE_DIRS.m22,
        // A franchise-common file. Only opened, never saved.
        common: path.join(BASE_DIRS.m22, 'common/FTC-E2ETEST'),
        career: {
            // Never opened directly: tests open their sandbox's copy (util/sandbox.js).
            pristine: path.join(BASE_DIRS.m22, 'career/CAREER-M22TEST')
        },
        exports: {
            player: path.join(BASE_DIRS.m22, 'export/4220.xlsx'),
            overallPercentage: path.join(BASE_DIRS.m22, 'export/4097.xlsx'),
            rawTable: {
                overallPercentage: path.join(BASE_DIRS.m22, 'export/4097_raw.dat')
            },
            frtk: {
                compare: path.join(BASE_DIRS.m22, 'export/full-export.frt')
            }
        },
        imports: {
            team: path.join(BASE_DIRS.m22, 'import/7482.xlsx'),
            overallPercentage: path.join(BASE_DIRS.m22, 'import/4097.xlsx'),
            stadium: path.join(BASE_DIRS.m22, 'import/4104.xlsx'),
            franchise: path.join(BASE_DIRS.m22, 'import/4712.xlsx'),
            rawTable: {
                overallPercentage: path.join(BASE_DIRS.m22, 'import/4097_raw_import_test.dat')
            }
        }
    }
};