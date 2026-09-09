import './globals.css';
import Sidebar from '../components/Sidebar';

export const metadata = {
  title: 'System Monitoring Dashboard',
  description: 'Sustainability, grievance, audit and compliance monitoring dashboard',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <Sidebar />
          <main className="main-content">
            <header className="topbar">
              <div>
                <div className="eyebrow">SUSTAINABILITY & COMPLIANCE</div>
                <strong>System Monitoring</strong>
              </div>
              <div className="user-chip">SM</div>
            </header>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
