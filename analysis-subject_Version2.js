// Subject 负责将上传的图片缩放到合适的大小
_.Subject = function(e) {
    this.srcImage = e;
    this.image = document.createElement("canvas");
    this.width = 0;
    this.height = 0;
    this.scale = 1;
    this.rescale();
};

_.Subject.prototype.rescale = function() {
    // 关键缩放逻辑：
    // 1. 面积占比不超过画布的 35%
    // 2. 宽度不超过画布宽 × 0.9 (Me=0.9)
    // 3. 高度不超过画布高 × 0.9
    // 如果太小则放大，太大则缩小
    for (var e=this.srcImage.width, t=this.srcImage.height, 
         i=e*t, o=canvas.width*canvas.height, r=1;
         i/o > 0.35 || e > canvas.width*0.9 || t > canvas.height*0.9;)
        r -= 0.01, i = (e=this.srcImage.width*r) * (t=this.srcImage.height*r);
    // 如果太小则放大
    if (!s) for (; i/o < 0.35 && e < canvas.width*0.9 && t < canvas.height*0.9;)
        r += 0.01, i = (e=this.srcImage.width*r) * (t=this.srcImage.height*r);
    this.scale = r;
    this.width = Math.round(e);
    this.height = Math.round(t);
};