import { useState } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';

import Layout from './routes/Layout/Layout';
import Welcome from './routes/Welcome/Welcome';
import TableEditor from './routes/TableEditor/TableEditor';
import SchemaManagement from './routes/SchemaManagement/SchemaManagement';

import { FranchiseFileContext } from './context/FranchiseFileContext';
import { PendingOpen, PendingOpenContext } from './context/PendingOpenContext';
import useActiveFranchiseFile from './hooks/useActiveFranchiseFile';

function App(): JSX.Element {
    const franchiseFileContextValue = useActiveFranchiseFile();
    const pendingOpen = useState<PendingOpen>();

    return (
        <FranchiseFileContext.Provider value={franchiseFileContextValue}>
            <PendingOpenContext.Provider value={pendingOpen}>
                <HashRouter>
                    <Routes>
                        <Route path='/' element={<Layout />}>
                            <Route index element={<Welcome />} />
                            <Route
                                path='table-editor'
                                element={<TableEditor />}
                            />
                            <Route
                                path='schema-management'
                                element={<SchemaManagement />}
                            />
                            <Route path='*' element={<Welcome />} />
                        </Route>
                    </Routes>
                </HashRouter>
            </PendingOpenContext.Provider>
        </FranchiseFileContext.Provider>
    );
}

export default App;
