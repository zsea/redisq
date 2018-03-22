const RedisQ = require('../index');

(async function () {
    var q = new RedisQ("redis://127.0.0.1/0", "test");
    q.setLog("TRACE");
    while (true) {
        let msg = await q.pull();
        await q.delay(msg.id, 60);
    }
})();