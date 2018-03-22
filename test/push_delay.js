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
    q.setLog("TRACE");
    //q.multi();
    for (let i = 0; i < 10; i++) {
        let id = await q.push({
            taskid: "aaaaa",
            num_iid: 123456789,
            session: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            action: "del",
            num: 9000
        }, 60);
        //for (let j = 0; j < 10; j++) {
        //    //q.send(["hset", "children:" + id, "j" + j, `${i}-${j}`], `${i}-${j}`);
        //}
    }
    let start = Date.now();
    //let result = await q.exec();
    let end = Date.now();
    //console.log(result);
    console.log("completed", end - start);
    console.log("process id", q.id);
})();