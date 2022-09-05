---
title   : "UEFI-C语言调用约定-X64"
layout  : post
date    : 2020-09-05 20:12:00 +0800
tags    : uefi.abi.ccc.x64
---

### 约定预览

| 要素         | 实现                                 |
| ------------ | ------------------------------------ |
| 实参进栈顺序 | 从右到左                             |
| 实参管理责任 | 主调函数负责被调函数的实参的栈帧管理 |
| 命名约定     | [_]function-name                     |

为啥主调函数负责被调函数的栈帧管理？为了支持可变参数。

### 主调函数 `(caller)`

* 保存现场，可变寄存器的压栈操作。
* 参数准备，初始化被调函数的参数，压栈的顺序的话请参考[实参传递顺序](#相关表格)。
* 调用指令，一是压栈返回的地址，二是分支进被调函数。
* 调用返回，被调函数的值位于 `EAX`。
* 参数清理，移除参数准备对栈的影响。
* 恢复现存，可变寄存器的出栈操作。

### 被调函数 `(callee)`

* 保存现场，不变寄存器的压栈操作。
* 分配变量，本地变量既可以存储在可变寄存器中，也可以存储在调用栈中。
* 函数结束，将函数的值存储到 `EAX`。
* 释放变量，释放本地变量所占的空间。
* 恢复现存，不变寄存器的出栈操作。
* 返回指令，一是出栈返回的地址，二是跳转到返回的地址。

### 相关表格

实参传递顺序：

| 类型 | 1st  | 2nd  | 3rd  | 4th  | 5th  | + |
| ---- | ---- | ---- | ---- | ---- | ---- | ---- |
| 整型 | RCX  | RDX  | R8   | R9   | 栈   | 栈   |
| 浮点 | XMM0 | XMM1 | XMM2 | XMM3 | 栈   | 栈   |

寄存器的属性：

| 属性 | - | - | - | - | - | - |
| ---- | --- | --- | --- | --- | ----------- | ---------- |
| 可变 | RAX | RCX | -   | -   | R8  - R11   | XMM0-XMM5  |
| 不变 | RBP | RBX | RDI | RSI | R12 - R15   | XMM6-XMM15 |

### 程序示例

```
[Defines]
  INF_VERSION                    = 0x00010005
  BASE_NAME                      = CccDemo
  FILE_GUID                      = e6c76f7b-9449-1748-b05c-385bd8bb5441
# MODULE_TYPE                    = UEFI_APPLICATION
  MODULE_TYPE                    = DXE_DRIVER
  VERSION_STRING                 = 1.0
  ENTRY_POINT                    = Main

[Sources]
  Main.c
  X64/Caller.nasm

[Packages]
  MdePkg/MdePkg.dec
  MdeModulePkg/MdeModulePkg.dec

[LibraryClasses]
# UefiApplicationEntryPoint
  UefiDriverEntryPoint
  BaseLib
  DebugLib

[Depex]
  TRUE

[BuildOptions.X64] 
  GCC:*_*_*_CC_FLAGS = -O0
```

```c
#include <Uefi.h>
#include <Library/BaseLib.h>
#include <Library/DebugLib.h>

extern
UINT64
EFIAPI
NasmCaller (
  OUT   UINT64                         *Arg1,
  IN    UINT64                          Arg2,
  IN    UINT64                          Arg3
  );

UINT64
EFIAPI
NasmCallee (
  OUT   UINT64                         *Arg1,
  IN    UINT8                           Arg2,
  IN    UINT32                          Arg3
  )
{
  DEBUG((DEBUG_ERROR, "%a(): &Arg1 = %08p, &Arg2 = %08p, &Arg3 = %08p\n", __FUNCTION__, &Arg1, &Arg2, &Arg3));
  DEBUG((DEBUG_ERROR, "%a(): *Arg1 = %08x,  Arg2 = %08x,  Arg3 = %08x\n", __FUNCTION__, *Arg1,  Arg2,  Arg3));

  return *Arg1;
}

EFI_STATUS
EFIAPI
Main (
  IN EFI_HANDLE                         ImageHandle,
  IN EFI_SYSTEM_TABLE                  *SystemTable
  )
{
  UINT64                                Atom = 0;

  UINT64                               *Arg1 = &Atom;
  UINT64                                Arg2 = 0;
  UINT64                                Arg3 = 1;

  // CpuBreakpoint();
  NasmCaller(Arg1, Arg2, Arg3);
  NasmCaller(Arg1, Arg2, Arg3);

  return EFI_SUCCESS;
}
```

```nasm
    DEFAULT REL                            ; Rip Relative Addressing
    SECTION .text                          ; Code Section

extern ASM_PFX(NasmCallee)
;------------------------------------------------------------------------------
;  UINT64
;  EFIAPI
;  NasmCaller (
;    OUT   UINT64                         *Arg1,
;    IN    UINT64                          Arg2,
;    IN    UINT64                          Arg3
;    );
;  {
;    UINT64                                Bak = *Arg1;
;    UINT64                                Ret;
;  
;    if (*Arg1 == Arg2) {
;      *Arg1 = Arg3;
;    }
;  
;    Ret = NasmCallee(Arg1, Arg2, Arg3);
;  
;    return Bak & Ret;
;  }
;------------------------------------------------------------------------------
global ASM_PFX(NasmCaller)                   ; Base.h: #define ASM_PFX(name)
ASM_PFX(NasmCaller):
; 保护现场
push    rbp
mov     rbp, rsp
; 分配变量
sub     rsp, 8

; 变量的初始化
mov     rax, [rcx]
mov     [rbp-8], rax

; 本地逻辑
cmp     [rcx], rdx
jne     .0
mov     [rcx], r8

.0:
; 函数调用.参数准备
sub     rsp, 16
push    r8
push    rdx
push    rcx
; 函数调用.调用指令
call    NasmCallee
; 函数调用.调用返回
and     rax, [rbp-8]
; 函数调用.参数清理
add     rsp, 40

; 释放变量
add     rsp, 8
; 恢复现场
pop     rbp

ret
```