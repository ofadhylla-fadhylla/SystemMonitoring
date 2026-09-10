import './globals.css';
import AuthGate from '../components/AuthGate';

export const metadata = {
  title: 'System Monitoring Dashboard',
  description: 'Sustainability and compliance system monitoring dashboard',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
