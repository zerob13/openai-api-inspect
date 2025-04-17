# openai-api-inspect

## 主要功能

- 用户填入一个 OpenAI 兼容格式的 API ，程序通过 OpenAI 的 SDK 去访问各种接口
- 程序本身代理出一个 OpenAI 兼容格式的 API, 监听本地的 7891 端口，然后暴露给用户调用
- 用户通过 OpenAI 的 SDK 调用程序代理出的本地接口来访问最终真实的API
- 程序记录所有的用户入参和SDK返回的响应，目前可以先打倒 Stdio