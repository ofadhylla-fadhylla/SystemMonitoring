import './globals.css';
import AuthGate from '../components/AuthGate';
import RiskWeightsBootstrap from '../components/RiskWeightsBootstrap';

export const metadata = {
  title: 'System Monitoring Dashboard',
  description: 'Sustainability and compliance system monitoring dashboard',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthGate><RiskWeightsBootstrap>{children}</RiskWeightsBootstrap></AuthGate>
      </body>
    </html>
  );
}
