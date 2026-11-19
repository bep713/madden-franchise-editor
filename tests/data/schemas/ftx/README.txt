Synthetic FTX fixtures for add-schema (unit + e2e). Small and hand-written;
the real game files are large and not redistributable. bad/ entries reuse
gen/Enums.FTX by adding it alongside. .gz inputs are built at test time
(tests/unit/helpers/schemaGz.js: makeSchemaGz(meta, schemas, {fileName})),
or, in e2e, copied from node_modules/madden-franchise/data/schemas/27/C27_468_2.gz
under a neutral name ("college.gz") so the game has to be chosen.
order/ pins the header order: depth-first pre-order, as generateSchemaV2 reads it.
