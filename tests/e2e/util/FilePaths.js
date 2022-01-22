const path = require('path');

const BASE_DIRS = {
    m22: path.join(__dirname, '../../data/m22')
};

module.exports = {
    m22: {
        base: BASE_DIRS.m22,
        career: {
            pristine: path.join(BASE_DIRS.m22, 'career/CAREER-M22TEST'),
            test: path.join(BASE_DIRS.m22, 'career/test/CAREER-E2ETEST')
        },
        exports: {
            player: path.join(BASE_DIRS.m22, 'export/4220.xlsx'),
            overallPercentage: path.join(BASE_DIRS.m22, 'export/4097.xlsx'),
            test: path.join(BASE_DIRS.m22, 'export/test/export.xlsx')
        },
        imports: {
            overallPercentage: path.join(BASE_DIRS.m22, 'import/4097.xlsx'),
            team: path.join(BASE_DIRS.m22, 'import/7482.xlsx')
        }
    }
};