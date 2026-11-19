import { useNavigate } from 'react-router-dom';
import games from '@data/games.json';
import Button from '@renderer/components/Button/Button';
import GridLayout from '@renderer/components/GridLayout/GridLayout';
import Headline from '@renderer/components/Headline/Headline';
import Loader from '@renderer/components/Loader/Loader';
import { basename } from '@renderer/utils/path';
import { pathKey } from '../SchemaManagement/schemaList';
import {
    type GameEntry,
    currentGame,
    folderProblems,
    isBlocked,
    splitProblems,
    summaryLine
} from './addSchemaModel';
import AdvancedOptionsCard from './components/AdvancedOptionsCard';
import GzFactsList from './components/GzFactsList';
import OptionsCard from './components/OptionsCard';
import ProblemList from './components/ProblemList';
import SchemaFilesCard, { type FileRow } from './components/SchemaFilesCard';
import useAddSchema from './useAddSchema';

import styles from './AddSchema.module.scss';

const GAMES = games as GameEntry[];

const AddSchema: React.FC = () => {
    const navigate = useNavigate();
    const {
        request,
        plan,
        inspecting,
        reading,
        adding,
        error,
        addFiles,
        removeFiles,
        setEntry,
        browse,
        setOverrides,
        setIncludeDefaults,
        add
    } = useAddSchema();

    const { byPath, general } = splitProblems(
        plan?.problems ?? [],
        request.files,
        (plan?.files ?? []).map((f) => f.path)
    );
    // A folder can hold thousands of files, so no find() per row
    const plannedByKey = new Map(
        (plan?.files ?? []).map((f) => [pathKey(f.path), f])
    );
    const rows: FileRow[] = request.files.map((path) => {
        const planned = plannedByKey.get(pathKey(path));
        return {
            path,
            name: planned?.name ?? basename(path),
            role: planned?.role,
            problems: byPath.get(path) ?? []
        };
    });
    const footerProblems = general.filter(
        // The Advanced options card says it
        (p) => p.code !== 'defaults-merged-at-load'
    );
    const folders = folderProblems(rows);
    const isGz = plan?.kind === 'copy-gz';
    const gzRow = isGz ? rows.find((row) => row.role === 'schema') : undefined;
    const canAdd = !isBlocked(plan) && !inspecting && !adding;

    async function handleAdd(): Promise<void> {
        const added = await add();
        if (added) {
            navigate('/schema-management', { state: { added } });
        }
    }

    return (
        <div className={styles.page}>
            <Headline
                actions={
                    <button
                        className={styles.back}
                        data-action='back-to-schemas'
                        onClick={() => navigate('/schema-management')}
                        type='button'
                    >
                        Back to schemas
                    </button>
                }
                text='Add Schema'
            />
            <main className={styles.main}>
                <GridLayout
                    alignItems='stretch'
                    columnGap='4'
                    // minmax(0, …): long names can't take width from Options
                    columns='minmax(0, 2fr) minmax(0, 1fr)'
                    rowGap='4'
                    rows='auto 1fr'
                >
                    <div className={styles.files}>
                        <SchemaFilesCard
                            facts={
                                plan?.facts && (
                                    <GzFactsList
                                        facts={plan.facts}
                                        fileName={gzRow?.name ?? ''}
                                        games={GAMES}
                                        savesAs={plan.target?.fileName ?? null}
                                    />
                                )
                            }
                            missing={
                                plan?.kind === 'generate' ? plan.missing : []
                            }
                            entryChosen={plan?.entryChosen ?? false}
                            onAddPaths={addFiles}
                            onBrowse={(kind) => void browse(kind)}
                            onRemove={removeFiles}
                            onSetEntry={setEntry}
                            rows={rows}
                        />
                    </div>
                    <OptionsCard
                        game={currentGame(request, plan)}
                        games={GAMES}
                        onOverride={setOverrides}
                        overrides={request.overrides}
                        plan={plan}
                    />
                    {!isGz && (
                        <AdvancedOptionsCard
                            includeDefaults={request.includeDefaults}
                            onIncludeDefaultsChange={setIncludeDefaults}
                        />
                    )}
                </GridLayout>
            </main>
            <div className={styles.footer}>
                {error && (
                    <p className={styles.error} role='alert'>
                        Could not read the files: {error}
                    </p>
                )}
                {(footerProblems.length > 0 || folders.length > 0) && (
                    <div className={styles.problems}>
                        <ProblemList
                            folders={folders}
                            phase='plan'
                            problems={footerProblems}
                        />
                    </div>
                )}
                <div className={styles.submit} aria-busy={inspecting}>
                    <p className={styles.summary} data-testid='add-summary'>
                        {summaryLine(plan)}
                    </p>
                    <Button
                        data-action='add'
                        disabled={!canAdd}
                        onClick={() => void handleAdd()}
                        state={canAdd ? 'default' : 'disabled'}
                        type='primary'
                    >
                        Add schema
                    </Button>
                </div>
            </div>
            {adding && <Loader message='Adding schema...' />}
            {reading && !adding && (
                <div className={styles.readingLoader}>
                    <Loader message='Reading schema files...' />
                </div>
            )}
        </div>
    );
};

export default AddSchema;
