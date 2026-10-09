// Ejecuta unitarias + API y después end-to-end, aunque el primer bloque falle; sale con error si falla alguno.
import { spawnSync } from 'node:child_process';

const run = (script) => spawnSync('npm', ['run', script], { stdio: 'inherit', shell: true }).status ?? 1;
const unitApi = run('test');
const e2e = run('test:e2e');
console.log(`\nResumen: unitarias + API ${unitApi === 0 ? 'OK' : 'CON FALLOS'} · end-to-end ${e2e === 0 ? 'OK' : 'CON FALLOS'}`);
process.exit(unitApi === 0 && e2e === 0 ? 0 : 1);
