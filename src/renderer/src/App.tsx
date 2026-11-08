import { HashRouter, Routes, Route } from 'react-router-dom';

import Layout from './routes/Layout/Layout';
import Welcome from './routes/Welcome/Welcome';
import TableEditor from './routes/TableEditor/TableEditor';
import SchemaManagement from './routes/SchemaManagement/SchemaManagement';

import { FranchiseFileContext } from './context/FranchiseFileContext';
import useActiveFranchiseFile from './hooks/useActiveFranchiseFile';

function App(): JSX.Element {
    const franchiseFileContextValue = useActiveFranchiseFile();

    return (
        <FranchiseFileContext.Provider value={franchiseFileContextValue}>
            <HashRouter>
                <Routes>
                    <Route path='/' element={<Layout />}>
                        <Route index element={<Welcome />} />
                        <Route path='table-editor' element={<TableEditor />} />
                        <Route
                            path='schema-management'
                            element={<SchemaManagement />}
                        />
                        <Route path='*' element={<Welcome />} />
                    </Route>
                </Routes>
            </HashRouter>
        </FranchiseFileContext.Provider>
    );
}

export default App;
