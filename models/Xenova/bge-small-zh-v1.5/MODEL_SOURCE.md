# bge-small-zh-v1.5 本地模型来源

- 基础模型：[BAAI/bge-small-zh-v1.5](https://huggingface.co/BAAI/bge-small-zh-v1.5)
- Transformers.js ONNX 转换：[Xenova/bge-small-zh-v1.5](https://huggingface.co/Xenova/bge-small-zh-v1.5)
- 使用文件：`onnx/model_quantized.onnx`（q8 量化）及仓库中的 tokenizer/config 文件
- 模型卡声明许可证：MIT
- 下载日期：2026-08-11
- `model_quantized.onnx` SHA-256：`15B717C382BCB518BA457B93EA6850EDE7F4F1CD8937454AA06972366CD19BCC`

该目录用于 Netlify 函数内的本地中文查询向量化。运行时关闭远程模型下载，问题文本不会发送到第三方向量服务。
