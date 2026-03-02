const mockFs = {
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
};
jest.mock('fs', () => mockFs);

const mockSpawn = jest.fn(() => ({ unref: jest.fn() }));
jest.mock('child_process', () => ({
    execFile: jest.fn(),
    spawn: mockSpawn,
}));

let cronController;

beforeEach(() => {
    jest.resetModules();
    jest.mock('fs', () => mockFs);
    jest.mock('child_process', () => ({
        execFile: jest.fn(),
        spawn: mockSpawn,
    }));
    cronController = require('../src/backend/controllers/cronController');
    Object.values(mockFs).forEach(fn => fn.mockReset());
    mockSpawn.mockReset();
    mockSpawn.mockReturnValue({ unref: jest.fn() });
});

function mockRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

const JOBS_DATA = {
    jobs: [
        { id: 'job1', name: 'Test Job 1', enabled: true },
        { id: 'job2', name: 'Test Job 2', enabled: false },
    ]
};

describe('getJobs', () => {
    it('returns jobs when file exists', async () => {
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockReturnValue(JSON.stringify(JOBS_DATA));
        const res = mockRes();
        await cronController.getJobs({}, res);
        expect(res.json).toHaveBeenCalledWith({ success: true, jobs: JOBS_DATA.jobs });
    });

    it('returns empty array when file does not exist', async () => {
        mockFs.existsSync.mockReturnValue(false);
        const res = mockRes();
        await cronController.getJobs({}, res);
        expect(res.json).toHaveBeenCalledWith({ success: true, jobs: [] });
    });

    it('returns 500 on JSON parse failure', async () => {
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockReturnValue('not valid json');
        const res = mockRes();
        await cronController.getJobs({}, res);
        expect(res.status).toHaveBeenCalledWith(500);
    });

    it('handles missing jobs array in file', async () => {
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockReturnValue(JSON.stringify({}));
        const res = mockRes();
        await cronController.getJobs({}, res);
        expect(res.json).toHaveBeenCalledWith({ success: true, jobs: [] });
    });
});

describe('toggleJob', () => {
    it('enables a job', async () => {
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockReturnValue(JSON.stringify(JOBS_DATA));
        const req = { params: { id: 'job2' }, body: { enabled: true } };
        const res = mockRes();
        await cronController.toggleJob(req, res);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('disables a job', async () => {
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockReturnValue(JSON.stringify(JOBS_DATA));
        const req = { params: { id: 'job1' }, body: { enabled: false } };
        const res = mockRes();
        await cronController.toggleJob(req, res);
        const written = JSON.parse(mockFs.writeFileSync.mock.calls[0][1]);
        expect(written.jobs.find(j => j.id === 'job1').enabled).toBe(false);
    });

    it('returns 404 for unknown job id', async () => {
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockReturnValue(JSON.stringify(JOBS_DATA));
        const req = { params: { id: 'nonexistent' }, body: { enabled: true } };
        const res = mockRes();
        await cronController.toggleJob(req, res);
        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 500 when file not found', async () => {
        mockFs.existsSync.mockReturnValue(false);
        const req = { params: { id: 'job1' }, body: { enabled: true } };
        const res = mockRes();
        await cronController.toggleJob(req, res);
        expect(res.status).toHaveBeenCalledWith(500);
    });
});

describe('deleteJob', () => {
    it('deletes an existing job', async () => {
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockReturnValue(JSON.stringify(JOBS_DATA));
        const req = { params: { id: 'job1' } };
        const res = mockRes();
        await cronController.deleteJob(req, res);
        expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('returns 404 for unknown job', async () => {
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockReturnValue(JSON.stringify(JOBS_DATA));
        const req = { params: { id: 'nope' } };
        const res = mockRes();
        await cronController.deleteJob(req, res);
        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 500 when file not found', async () => {
        mockFs.existsSync.mockReturnValue(false);
        const req = { params: { id: 'job1' } };
        const res = mockRes();
        await cronController.deleteJob(req, res);
        expect(res.status).toHaveBeenCalledWith(500);
    });
});

describe('runJob', () => {
    it('spawns openclaw and returns accepted', async () => {
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockReturnValue(JSON.stringify(JOBS_DATA));
        const req = { params: { id: 'job1' } };
        const res = mockRes();
        await cronController.runJob(req, res);
        expect(mockSpawn).toHaveBeenCalledWith(
            expect.any(String),
            ['cron', 'run', 'job1'],
            expect.objectContaining({ detached: true })
        );
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, jobId: 'job1' }));
    });

    it('returns 404 for unknown job', async () => {
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockReturnValue(JSON.stringify(JOBS_DATA));
        const req = { params: { id: 'unknown' } };
        const res = mockRes();
        await cronController.runJob(req, res);
        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 500 when jobs file not found', async () => {
        mockFs.existsSync.mockReturnValue(false);
        const req = { params: { id: 'job1' } };
        const res = mockRes();
        await cronController.runJob(req, res);
        expect(res.status).toHaveBeenCalledWith(500);
    });
});
