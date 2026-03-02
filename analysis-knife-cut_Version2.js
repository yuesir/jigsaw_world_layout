// cutChoices: 根据图片大小和目标碎片数推算 rows/cols/size
cutChoices: function(e) {
    var m = Math.floor(p > g ? p/3 : g/3); // 从大尺寸开始递减
    while (h < 1000 && m > 10) {
        h = (c=Math.floor(g/m)) * (d=Math.floor(p/m)); // rows × cols
        if (h >= 6 && h >= minNop) {
            Hn.push({nop:h, rows:c, cols:d, size:m, selected:false});
        }
        // 递减尺寸
        s = Math.floor(g/(c+1));
        l = Math.floor(p/(d+1));
        m = Math.max(s, l);
    }
}

// cut: 实际切割
cut: function(t, i) {
    var f = i.size; // 目标边长
    var k = t.width % f;  // 横向余数
    var S = t.height % f; // 纵向余数
    var C = Math.floor(k / cols); // 均摊
    var T = Math.floor(S / rows);
    var z = k % cols; // 零头
    var I = S % rows;
    
    for (M = 0; M < rows; M++) {
        for (B = 0; B < cols; B++) {
            y = f; b = f; // 基础尺寸
            if (k > 0) { k -= C; y += C; if (z > 0) { y++; z--; } }
            // ... 创建 piece spec
            v.core = { width: y, height: b };
        }
    }
}