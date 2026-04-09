/**
 * Self-signed TLS for local HTTPS. Run: npm run generate-cert (from backend/)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import selfsigned from 'selfsigned';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const certsDir = path.join(__dirname, '..', 'certs');

async function main() {
  fs.mkdirSync(certsDir, { recursive: true });
  const attrs = [{ name: 'commonName', value: 'localhost' }];
  const notAfter = new Date();
  notAfter.setFullYear(notAfter.getFullYear() + 1);
  const pems = await selfsigned.generate(attrs, {
    keySize: 2048,
    algorithm: 'sha256',
    notBeforeDate: new Date(),
    notAfterDate: notAfter,
    extensions: [
      { name: 'basicConstraints', cA: false, critical: true },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
      { name: 'extKeyUsage', serverAuth: true },
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 7, ip: '127.0.0.1' },
          { type: 7, ip: '::1' },
        ],
      },
    ],
  });
  const keyFile = path.join(certsDir, 'localhost-key.pem');
  const certFile = path.join(certsDir, 'localhost-cert.pem');
  fs.writeFileSync(keyFile, pems.private, { mode: 0o600 });
  fs.writeFileSync(certFile, pems.cert, { mode: 0o644 });
  console.log('Created:', certFile, keyFile);
  console.log('Set HTTPS_CERT_PATH=./certs/localhost-cert.pem and HTTPS_KEY_PATH=./certs/localhost-key.pem in .env');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
