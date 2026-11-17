import type { Problem } from '@shared/types';
import { describeProblem, type ProblemPhase } from '../describeProblem';
import { useShowMore } from './ShowMore';

import styles from './ProblemList.module.css';

export const VISIBLE_PROBLEMS = 5;

interface Props {
    phase: ProblemPhase;
    problems: Problem[];
}

const ProblemList: React.FC<Props> = ({ phase, problems }: Props) => {
    const { visible, toggle } = useShowMore(
        problems,
        VISIBLE_PROBLEMS,
        'problems'
    );
    if (!problems.length) return null;
    return (
        <div className={styles.wrapper}>
            <ul aria-label='Problems' className={styles.problems}>
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
