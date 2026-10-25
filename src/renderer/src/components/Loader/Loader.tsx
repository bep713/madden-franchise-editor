import Layout from '../Layout/Layout';
import Text from '../Text/Text';
import styles from './Loader.module.css';

interface Props {
    message?: string;
}

const Loader: React.FC<Props> = ({ message }: Props) => {
    return (
        <div
            aria-busy='true'
            aria-label={message ? undefined : 'Loading'}
            aria-live='polite'
            className={styles.loaderWrapper}
            role='status'
        >
            <div className={styles.loaderBlock}>
                <Layout alignItems='center' direction='column' rowGap='6'>
                    <div className={styles.loader}></div>
                    {message && <Text typography='labelLarge'>{message}</Text>}
                </Layout>
            </div>
        </div>
    );
};

export default Loader;
