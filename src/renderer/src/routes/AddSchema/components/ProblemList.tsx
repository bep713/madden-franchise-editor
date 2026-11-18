import type { Problem } from '@shared/types';
import { type FolderProblems, list, worstSeverity } from '../addSchemaModel';
import { describeProblem, type ProblemPhase } from '../describeProblem';
import { useShowMore } from './ShowMore';

import styles from './ProblemList.module.css';

export const VISIBLE_PROBLEMS = 5;

interface Props {
    phase: ProblemPhase;
    problems: Problem[];
    // Folders whose files have problems, listed before the page's own
    folders?: FolderProblems[];
}

function count(n: number, word: string): string {
    return `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;
}

export function describeFolder(folder: FolderProblems): string {
    const { problems, files } = folder;
    const where =
        files.length === 1
            ? `${files[0]} in ${folder.folder}`
            : `${count(files.length, 'file')} in ${folder.folder} (${list(files)})`;
    return `${count(problems.length, 'problem')} in ${where}. Expand the folder to see ${problems.length === 1 ? 'it' : 'them'}; files with problems are listed first.`;
}

const ProblemList: React.FC<Props> = ({
    phase,
    problems,
    folders = []
}: Props) => {
    const { visible, toggle } = useShowMore(
        problems,
        VISIBLE_PROBLEMS,
        'problems'
    );
    if (!problems.length && !folders.length) return null;
    return (
        <div className={styles.wrapper}>
            <ul aria-label='Problems' className={styles.problems}>
                {folders.map((folder) => (
                    <li
                        className={styles.problem}
                        data-folder-problems={folder.folder}
                        data-severity={worstSeverity(folder.problems)}
                        key={folder.folder}
                    >
                        {describeFolder(folder)}
                    </li>
                ))}
                {visible.map((problem, index) => (
                    <li
                        className={styles.problem}
                        data-problem={problem.code}
                        data-severity={problem.severity}
                        key={`${problem.code}-${index}`}
                    >
                        {describeProblem(problem, phase)}
                    </li>
                ))}
            </ul>
            {toggle}
        </div>
    );
};

export default ProblemList;
