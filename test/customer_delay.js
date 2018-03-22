const RedisQ = require('../index');

(async function () {
    var q = new RedisQ("redis://127.0.0.1/0", "test");
    q.setLog("TRACE");
    while (true) {
        let msg = await q.pull();
        console.log("消费消息",JSON.stringify(msg,null,4));
        await new Promise(function(resolve){
            setTimeout(resolve,5000);
        });
        await q.ack(msg.id);
    }
})();