import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './components/Dashboard'
import PositionForm from './components/PositionForm'
import RollAnalysis from './components/RollAnalysis'
import Documentation from './components/Documentation'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="add" element={<PositionForm />} />
        <Route path="edit/:id" element={<PositionForm />} />
        <Route path="roll/:id" element={<RollAnalysis />} />
        <Route path="help" element={<Documentation />} />
      </Route>
    </Routes>
  )
}

export default App
