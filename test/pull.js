const RedisQ = require('../index');

(async function () {
    var q = new RedisQ("redis://127.0.0.1/0", "test");
    while (true) {
        let msg = await q.pull();
        console.log(msg);
        await q.ack(msg.id)
    }
})();