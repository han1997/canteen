# 灏忕▼搴忕幆澧冨垏鎹㈣鏄?
## 鑷姩鍒囨崲瑙勫垯
- `develop`锛氫娇鐢?`http://127.0.0.1:8000/api/v1`
- `trial`锛氫娇鐢?`https://gfqq.iepose.cn/api/v1`
- `release`锛氫娇鐢?`https://gfqq.iepose.cn/api/v1`

榛樿鎸夊井淇＄幆澧?`envVersion` 鑷姩璇嗗埆锛坄wx.getAccountInfoSync().miniProgram.envVersion`锛夈€?
## 鎵嬪姩瑕嗙洊锛堣皟璇曠敤锛?鍦ㄥ皬绋嬪簭浠绘剰椤甸潰鎺у埗鍙版墽琛岋細

```js
const { setRuntimeEnv, clearRuntimeEnv } = require("/config/env");

// 鍒囧埌寮€鍙戠幆澧?setRuntimeEnv("develop");

// 鍒囧埌浣撻獙鐜
setRuntimeEnv("trial");

// 鍒囧埌鐢熶骇鐜
setRuntimeEnv("release");

// 娓呴櫎鎵嬪姩瑕嗙洊锛屾仮澶嶈嚜鍔ㄨ瘑鍒?clearRuntimeEnv();
```

鎵ц鍚庤閲嶆柊鍚姩灏忕▼搴忥紝璁?`App.onLaunch` 閲嶆柊鍔犺浇鍩哄湴鍧€銆?
