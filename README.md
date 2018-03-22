# 介绍

用Redis实现的支持事务的消息队列。

# 背景

在用Redis的list做队列的时候，存在消息丢失的问题，该项目主要解决消息的稳定性。

# 使用

## 安装

```shell
npm install --save node-redis-q
```

## 创建实例

```javascript
var RedisQ=require("node-redis-q");
var queue=new RedisQ(conn, name,isDelay);
```
### 参数描述
* ```conn```:ioredis的连接字符串或都连接对象，例```redis://127.0.0.1/0```
* ```name```:第二个参数为队列名称
* ```isDelay```:是否是延迟队列，延迟队列的消息会开启一个延迟消息扫描线程，默认开启。

## 写入消息

```javascript
await queue.push(msg,[name],[delay]);
```

### 参数描述

* ```msg```:消息内容，可以是Javascript对象
* ```name```:入队的队列名称，若为空则取实例的队列名称。
* ```delay```:消息延迟多长时间才执行，单位：秒。

## 读取消息

```javascript
await queue.pull();
```

### 返回值

返回值为一个Javascript对象

```javascript
{
    id:"", //消息id
    content:"", //消息内容，可以是Object类型
    times:0 //消息被读取的次数
}
```

## 确认消息

```javascript
await queue.ack(id,[success]);
```

### 参数描述

* ```id```:消息id
* ```success```:消息是否消费成功，默认：```true```。

## 事务

使用redis的multi开启对事务的支持，开启后，可以同队列操作一起执行redis的命令。

### 开启事务

开启事务后，push和ack方法也需要和手动提交。

```javascript
queue.multi()
```

### 自定义命令

```javascript
queue.send(command,id);
```

#### 参数描述

* ```command```:一条redis命令，以数组方式传入各参数，如：```["set","test","aaa"]```
* ```id```:命令id，有id的命令会有返回值。

### 事务提交

```javascript
await queue.exec();
```

#### 返回值

返回值为一个数组，包含了对应的自定义命令的返回结果。

### 取消事务

```javascript
queue.discard();
```

## 调试日志

```javascript
queue.setLog(level);
```

### 参数说明 

* ```level```:日志级别，详见log4js

## 延迟一个队列中的消息

```javascript
queue.delay(id,seconds);
```

### 参数说明 

* ```id```:需要延迟的消息id。
* ```seconds```:延迟时长，单位：秒。

**被延迟的消息不需要再调用ack进行消费确认。**