import Layout from '../Layout/Layout';
import Text from '../Text/Text';
import styles from './Loader.module.css';

interface Props {
    message?: string;
}

const Loader: React.FC<Props> = ({ message }: Props) => {
    return (
        <div className={styles.loaderWrapper}>
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
