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
    for (let i = 0; i < 100; i++) {
        let id = await q.push("msg" + i);
        console.log(i, id);
    }
    console.log("completed");
})();