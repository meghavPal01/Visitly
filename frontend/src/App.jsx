import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/auth'
import StaffLayout from './components/StaffLayout'
import Login from './pages/staff/Login'
import Dashboard from './pages/staff/Dashboard'
import Leads from './pages/staff/Leads'
import LeadDetail from './pages/staff/LeadDetail'
import FactSheet from './pages/staff/FactSheet'
import Slots from './pages/staff/Slots'
import Comms from './pages/staff/Comms'
import InboxPage from './pages/staff/Inbox'
import Audit from './pages/staff/Audit'
import Enquire from './pages/buyer/Enquire'
import Chat from './pages/buyer/Chat'

function RequireStaff() {
  const { user } = useAuth()
  return user ? <Outlet /> : <Navigate to="/staff" replace />
}
function AdminOnly({ children }) {
  const { user } = useAuth()
  return user?.role === 'admin' ? children : <Navigate to="/app" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Enquire />} />
      <Route path="/chat" element={<Chat />} />
      <Route path="/staff" element={<Login />} />
      <Route element={<RequireStaff />}>
        <Route path="/app" element={<StaffLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="leads" element={<Leads />} />
          <Route path="leads/:id" element={<LeadDetail />} />
          <Route path="project" element={<AdminOnly><FactSheet /></AdminOnly>} />
          <Route path="slots" element={<Slots />} />
          <Route path="comms" element={<Comms />} />
          <Route path="inbox" element={<InboxPage />} />
          <Route path="audit" element={<AdminOnly><Audit /></AdminOnly>} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
