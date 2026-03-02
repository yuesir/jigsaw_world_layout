// scatter 的螺旋矩形布局算法：
scatter: function(e) {
    // 1. 计算参考碎片尺寸 p, g（含 5% 余量）
    p *= 1.05 / specList.length;
    g *= 1.05 / specList.length;
    
    // 2. 计算格子数和格子尺寸 S, C
    var w = (canvas.width - b) / p;   // 浮点列数
    var P = canvas.height / g;         // 浮点行数
    var E = w - Math.floor(w) >= 0.5 ? 1 : 0;
    var k = P - Math.floor(P) >= 0.5 ? 1 : 0;
    var S = p * (w / (Math.floor(w) + E)); // 格子宽
    var C = g * (P / (Math.floor(P) + k)); // 格子高
    
    // 3. 初始化螺旋起点
    var I = b + p/2;  // 左上角 x
    var L = g/2;       // 左上角 y
    var O = canvas.width;  // 右边界
    var A = C;              // 上边界
    var M = canvas.height;  // 下边界
    var j = 3;              // 初始方向 (3=向右)
    
    // 4. 螺旋放置
    // j=3 → 向右, j=1 → 向下, j=2 → 向左, j=0 → 向上
    // 每走完一条边，转向并收缩边界
    while (pieces.length > 0) {
        piece = pieces.pop();
        // 检测碰撞（boxTop、已放置碎片）
        var Y = checkCollision();
        // X = 当前位置可以放置且边界内有空间
        if (X) {
            piece.position.assign(I + offsetX, L + offsetY);
        }
        // 移动到下一个格子位置
        switch(j) {
            case 3: // 向右
                if ((f=I+ee) > O-l) { j=1; N--; I=O-p/2; L+=te; } 
                else I=f;
                break;
            case 1: // 向下
                if ((v=L+te) > M-c) { j=2; R--; L=M-g/2; I-=ee; } 
                else L=v;
                break;
            case 2: // 向左
                if ((f=I-ee) < b+l) { j=0; N--; I=b+p/2; L-=te; }
                else I=f;
                break;
            case 0: // 向上
                if ((v=L-te) < A+c) { j=3; R--; L=A+g/2; I+=ee; }
                else L=v;
                break;
        }
    }
}