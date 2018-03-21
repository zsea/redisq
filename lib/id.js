function createid(len) {
    len = len || 32;
    const secret_chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    var secret = '';
    for (var i = 0; i < len; i++) {
        var index = Math.ceil(Math.random() * secret_chars.length);
        secret += secret_chars.substr(index, 1);
    }
    return secret;
}
module.exports = createid;