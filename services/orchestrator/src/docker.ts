import Docker from 'dockerode';
import { config } from './config.js';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

export async function inspectApp(): Promise<{ id: string; startedAt: number; running: boolean } | null> {
  try {
    const info = await docker.getContainer(config.demoAppContainer).inspect();
    return { id: info.Id.slice(0, 12), startedAt: Date.parse(info.State.StartedAt), running: info.State.Running };
  } catch {
    return null;
  }
}

export async function restartApp() {
  await docker.getContainer(config.demoAppContainer).restart({ t: 1 });
}
