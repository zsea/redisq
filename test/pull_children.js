process.on('unhandledRejection', function (reason, p) {
    console.error("Promise中有未处理的错误", p, " 错误原因: ", reason);
    // application specific logging, throwing an error, or other logic here
    setTimeout(function () {
        process.exit(1);
    }, 5000)
});
const RedisQ = require('../index');
const idCreate = require("../lib/id");
(async function () {
    var q = new RedisQ("redis://127.0.0.1/0", "test");
    while (true) {
        let msg = await q.pull();
        let id = msg.id;
        q.multi();
        for (let j = 0; j < 10; j++) {
            q.send(["hdel", "children:" + id, "j" + j]);
            q.send(["exists", "children:" + id], "ret" + j);
        }

        q.send(["exists", "children:" + id], "ret");
        q.ack(id);
        let ret = await q.exec();
        //console.log(ret);
        console.log("completed.");
    }
})();