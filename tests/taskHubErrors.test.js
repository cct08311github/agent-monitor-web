// taskHubController - error path tests
// Tests the catch blocks when the database fails

jest.mock('better-sqlite3', () => {
    return jest.fn().mockImplementation(() => {
        throw new Error('DB connection failed');
    });
});

let taskHubController;

beforeEach(() => {
    jest.resetModules();
    jest.mock('better-sqlite3', () => {
        return jest.fn().mockImplementation(() => {
            throw new Error('DB connection failed');
        });
    });
    taskHubController = require('../src/backend/controllers/taskHubController');
});

function mockRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

describe('taskHubController - DB failure paths', () => {
    it('getStats returns 500 when DB fails', async () => {
        const res = mockRes();
        await taskHubController.getStats({}, res);
        expect(res.status).toHaveBeenCalledWith(500);
    });

    it('getTasks returns 500 when DB fails', async () => {
        const req = { query: {} };
        const res = mockRes();
        await taskHubController.getTasks(req, res);
        expect(res.status).toHaveBeenCalledWith(500);
    });

    it('createTask returns 500 when DB fails', async () => {
        const req = { body: { domain: 'work', title: 'test' } };
        const res = mockRes();
        await taskHubController.createTask(req, res);
        expect(res.status).toHaveBeenCalledWith(500);
    });

    it('updateTask returns 500 when DB fails', async () => {
        const req = { params: { domain: 'work', id: '1' }, body: { status: 'done' } };
        const res = mockRes();
        await taskHubController.updateTask(req, res);
        expect(res.status).toHaveBeenCalledWith(500);
    });

    it('deleteTask returns 500 when DB fails', async () => {
        const req = { params: { domain: 'work', id: '1' } };
        const res = mockRes();
        await taskHubController.deleteTask(req, res);
        expect(res.status).toHaveBeenCalledWith(500);
    });
});
