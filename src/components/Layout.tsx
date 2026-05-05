import { NavLink, Outlet } from 'react-router-dom'

export function Layout() {
  return (
    <div className="app-shell">
      <header className="header">
        <h1>Projeto de Teste Deploy</h1>
        <nav className="nav">
          <NavLink
            to="/"
            className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
          >
            Home
          </NavLink>
          <NavLink
            to="/sobre"
            className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
          >
            Sobre
          </NavLink>
        </nav>
      </header>

      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
