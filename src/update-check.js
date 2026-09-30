import semver from 'semver';

const DEFAULT_REGISTRY = 'https://registry.npmjs.org';

export async function fetchLatestVersion(name, { registry = DEFAULT_REGISTRY, timeoutMs = 2000 } = {}) {
    try {
        const res = await fetch(`${registry.replace(/\/+$/, '')}/${name}/latest`, {
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) {
            return null;
        }
        const { version } = await res.json();
        return semver.valid(version) ? version : null;
    } catch {
        // Offline or a slow registry must never keep the tool from starting.
        return null;
    }
}

/**
 * @returns {Promise<{ status: 'up-to-date' | 'declined' | 'updated' | 'failed', latest: string | null }>}
 */
export async function checkForUpdate({ current, fetchLatest, confirm, install, log }) {
    const latest = await fetchLatest();
    if (!latest || !semver.valid(current) || !semver.gt(latest, current)) {
        return { status: 'up-to-date', latest };
    }

    log.notice(current, latest);
    if (!(await confirm(latest))) {
        return { status: 'declined', latest };
    }

    try {
        await install(latest);
        return { status: 'updated', latest };
    } catch {
        return { status: 'failed', latest };
    }
}
