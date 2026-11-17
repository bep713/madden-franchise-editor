import Card from '@renderer/components/Card/Card';
import Checkbox from '@renderer/components/Checkbox/Checkbox';
import { describeProblem } from '../describeProblem';

import styles from './OptionsCard.module.css';

interface Props {
    includeDefaults: boolean;
    onIncludeDefaultsChange: (value: boolean) => void;
}

const AdvancedOptionsCard: React.FC<Props> = ({
    includeDefaults,
    onIncludeDefaultsChange
}: Props) => (
    <Card border='black' header={{ title: 'Advanced options' }}>
        <Checkbox
            checked={includeDefaults}
            data-field='include-defaults'
            description="Adds the editor's built-in tables that the game files don't define."
            label='Add default schemas'
            onChange={onIncludeDefaultsChange}
        />
        {!includeDefaults && (
            <p className={styles.hint} data-problem='defaults-merged-at-load'>
                {describeProblem(
                    { code: 'defaults-merged-at-load', severity: 'info' },
                    'plan'
                )}
            </p>
        )}
    </Card>
);

export default AdvancedOptionsCard;
