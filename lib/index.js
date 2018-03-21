const Redis = require("ioredis")
    , idCreate = require("./id")
    , log4js = require("log4js");

const queue_header = -1, search_mode = -1;
async function restore(redis, queue, item, logger) {
    logger.debug("上次异常消息", item);
    let current = await redis.lindex("RedisQ:" + queue + ":idList2", queue_header);
    logger.debug("当前消息", current, "是否需要恢复", current == item);
    if (current == item) {
        //开始恢复
        logger.trace("开始恢复消息", current)
        await redis.multi().lrem("RedisQ:" + queue + ":idList2", search_mode, current)
            .rpush("RedisQ:" + queue + ":idList1", current)
            .hset("RedisQ:" + queue + ":status", current, "waiting")
            .hdel("RedisQ:" + queue + ":exector", current)
            .hdel("RedisQ:" + queue + ":pulltime", current)
            .hdel("RedisQ:" + queue + ":scan", current)
            .hincrby("RedisQ:" + queue + ":failtimes", current, 1)
            .exec();
    }
}
async function scan(redis, queue, logger) {
    let item = await redis.lindex("RedisQ:" + queue + ":idList2", queue_header);
    if (!item) return;
    logger.debug("扫描到消息", item);
    let query = await redis.multi()
        .hget("RedisQ:" + queue + ":status", item)
        .hget("RedisQ:" + queue + ":exector", item)
        .hget("RedisQ:" + queue + ":scan", item)
        .exec();
    logger.debug("消息信息", JSON.stringify(query, null, 4));
    let state = query[0][1], exector = query[1][1], times = query[2][1] || 0;
    if (state == "execing") {
        //判断执行线程是否在线
        let exists = await redis.exists("RedisQ:" + queue + ":connection:" + exector);
        logger.debug("线程", exector, "已离线。");
        if (!exists) { //执行程序已掉线
            //检查并恢复到初始状态
            await restore(redis, queue, item, logger);
            return true;
        }
    }
    else if (state == "waiting" && !exector) {
        logger.trace("消息", item, "状态异常，稍后将再次检查。");
        if (times > 3) {
            //检查并恢复到初始状态
            await restore(redis, queue, item, logger);
            return true;
        }
        else {
            logger.trace("消息", item, "扫描次数+1。");
            let scan_times = await redis.hincrby("RedisQ:" + queue + ":scan", item, 1);
            logger.trace("消息", item, "扫描次数", scan_times);
        }
    }
    return false;
}
function sleep(ms) {
    return new Promise(function (resolve) {
        setTimeout(resolve, ms);
    });
}
function RedisQ(connection, queue) {
    if (!connection) {
        throw new ReferenceError("缺少参数connection");
    }
    if (!queue) {
        throw new ReferenceError("缺少参数queue");
    }
    let redis = null;
    if (typeof connection == "string" || (typeof connection === "object" && connection.host)) {
        redis = new Redis(connection)
    }
    else {
        redis = connection;
    }
    var author = idCreate(), isMaster = false, online = false;
    var logger = log4js.getLogger("RedisQ:" + queue);
    logger.level = "ERROR";
    this.setLog = function (level) {
        logger.level = level;
    }
    logger.debug("实例id", author);
    var commands = null;
    (async function () {//启动扫描线程
        while (true) {
            if (isMaster) {
                logger.trace("开始扫描")
                if (await scan(redis, queue, logger)) {
                    logger.debug("扫描结果", true);
                    continue;
                }
            }
            await sleep(10000);
        }
    })();
    async function heartbeat() {//启动心跳和Master抢占线程
        logger.trace("发送心跳")
        let mult = redis.multi()
            .set("RedisQ:" + queue + ":connection:" + author, Date.now(), "EX", 30);
        if (isMaster) {
            mult = mult.expire("RedisQ:" + queue + ":master", 30)
        }
        else {
            mult = mult.set("RedisQ:" + queue + ":master", author, "EX", 30, "NX");
        }
        let ret = await mult.exec();
        if (ret[1][1]) {
            logger.debug("锁定Master");
            isMaster = true;
        }
        online = true;
    }
    heartbeat();
    setInterval(heartbeat, 10000);

    this.__defineGetter__("id", function () {
        return author;
    });
    this.__defineGetter__("multi", function () {
        return function () {
            logger.trace("开启事务");
            commands = [];
        }
    });
    this.pull = async function () {
        while (!online) {
            await sleep(1000);
        }
        logger.trace("开始拉取消息");
        let id = null;
        while (true) {
            id = await redis.brpoplpush("RedisQ:" + queue + ":idList1", "RedisQ:" + queue + ":idList2", 10);
            if (id) break;
        }
        logger.debug("获取到消息id", id);
        let results = await redis.multi()
            .hset("RedisQ:" + queue + ":status", id, "execing")
            .hset("RedisQ:" + queue + ":exector", id, author)
            .zadd("RedisQ:" + queue + ":pulltime", Date.now(), id)
            .hget("RedisQ:" + queue + ":content", id)
            .hget("RedisQ:" + queue + ":failtimes", id) //失败次数
            .exec();
        logger.debug("消息内容", results[3][1]);
        return {
            id: id,
            content: JSON.parse(results[3][1]),
            times: results[4][1] || 0
        };
    }
    this.push = async function (msg, _queue) {
        let id = idCreate(32);
        let _commands = commands || [];
        _queue = _queue || queue;
        logger.debug("生成消息", id);
        _commands.push([["lpush", "RedisQ:" + _queue + ":idList1", id]]);
        _commands.push([["hset", "RedisQ:" + _queue + ":status", id, "waiting"]]);
        _commands.push([["zadd", "RedisQ:" + _queue + ":pushtime", Date.now(), id]]);
        _commands.push([["hset", "RedisQ:" + _queue + ":content", id, JSON.stringify(msg)]]);
        if (!commands) {
            _commands = _commands.map(function (cmd) {
                return cmd[0];
            });
            await redis.multi(_commands).exec();
        }
        return id;

    }
    this.ack = async function (id, success) {
        if (success !== false) success = true;
        logger.debug("确认消息", id, success);
        let _commands = commands || [];
        if (success) {
            _commands.push([["lrem", "RedisQ:" + queue + ":idList2", search_mode, id]]);
            _commands.push([["hdel", "RedisQ:" + queue + ":status", id]]);
            _commands.push([["hdel", "RedisQ:" + queue + ":content", id]]);
            _commands.push([["hdel", "RedisQ:" + queue + ":exector", id]]);
            _commands.push([["zrem", "RedisQ:" + queue + ":pulltime", id]]);
            _commands.push([["hdel", "RedisQ:" + queue + ":failtimes", id]]);
            _commands.push([["zrem", "RedisQ:" + queue + ":pushtime", id]]);
            _commands.push([["hdel", "RedisQ:" + queue + ":scan", id]]);
        }
        else {
            _commands.push([["lrem", "RedisQ:" + queue + ":idList2", search_mode, id]]);
            _commands.push([["rpush", "RedisQ:" + queue + ":idList1", id]])
            _commands.push([["hset", "RedisQ:" + queue + ":status", id, "waiting"]])
            _commands.push([["hincrby", "RedisQ:" + queue + ":failtimes", id, 1]])
            _commands.push([["hdel", "RedisQ:" + queue + ":exector", id]]);
            _commands.push([["zrem", "RedisQ:" + queue + ":pulltime", id]]);
            _commands.push([["hdel", "RedisQ:" + queue + ":scan", id]]);
        }
        if (!commands) {
            _commands = _commands.map(function (cmd) {
                return cmd[0];
            });
            await redis.multi(_commands).exec();
        }
    }
    this.exec = async function () {
        let _commands = commands;
        commands = null;
        let idList = [], cmdArray = [];
        _commands.map(function (cmd) {
            idList.push(cmd[1]);
            cmdArray.push(cmd[0]);
        });
        logger.trace("提交事务");
        let results = await redis.multi(cmdArray).exec();
        logger.debug("事务结果", JSON.stringify(results, null, 4));
        results = results.map(function (r, _index) {
            return {
                id: idList[_index],
                result: r
            }
        }).filter(function (r) {
            return !!r.id;
        })
        return results;
    }
    this.send = function (command, id) {
        commands.push([command, id]);
        logger.debug("添加命令", JSON.stringify(command), id);
    }
    this.discard = function () {
        logger.trace("取消事务")
        commands = null;
    }
}

module.exports = RedisQ