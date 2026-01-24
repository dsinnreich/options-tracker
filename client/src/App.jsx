import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './components/Dashboard'
import PositionForm from './components/PositionForm'
import RollAnalysis from './components/RollAnalysis'
import Documentation from './components/Documentation'
import Login from './components/Login'
import ResetPassword from './components/ResetPassword'
import Admin from './components/Admin'
import ProtectedRoute from './components/ProtectedRoute'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/" element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }>
        <Route index element={<Dashboard />} />
        <Route path="add" element={<PositionForm />} />
        <Route path="edit/:id" element={<PositionForm />} />
        <Route path="roll/:id" element={<RollAnalysis />} />
        <Route path="help" element={<Documentation />} />
        <Route path="admin" element={<Admin />} />
      </Route>
    </Routes>
  )
}

export default App
