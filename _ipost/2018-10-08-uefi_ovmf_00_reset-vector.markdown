---
title   : "UEFI - 第一条指令执行的原理？"
layout  : post
date    : 2018-10-08 10:35:52 +800
tags    : uefi.reset-vector
---

系统一上电，BSP便从复位向量处执行第一条指令。此时，CS.BA = 0xFFFF0000，EIP = FFF0，因此第一条指令位置 = CS.BA + EIP = 0xFFFFFFF0。而CS.SR = F000，CS.SR会保持初始值，直到由代码重新初始化为止。

#### 1. 关键驱动

```
[Defines]
  INF_VERSION                     = 0x00010005
  BASE_NAME                       = ResetVector
  FILE_GUID                       = 1BA0062E-C779-4582-8566-336AE8F78F09
  MODULE_TYPE                     = SEC
  VERSION_STRING                  = 1.1

#
# The following information is for reference only and not required by the build tools.
#
#  VALID_ARCHITECTURES            = IA32
#

[Sources]
  ResetVector.nasmb

[Packages]
  MdePkg/MdePkg.dec
  MdeModulePkg/MdeModulePkg.dec
```

此外，FDF文件也是该驱动的重要消费清单之一。因为FDF会决定BIOS驱动在ROM中的布局，而该驱动的布局位置，需要处于复位向量可及的范围。

### 2. 核心逻辑

驱动的核心逻辑如下：

```nasm
BITS    16

MainRoutine16:
    OneTimeCall InitReal16
    OneTimeCall TransitionFromReal16ToFlat32

BITS    32

    OneTimeCall Flat32SearchForBfvBase
    ; EBP - 存放BFV的起始地址

    OneTimeCall Flat32SearchForSecCoreEntryPoint
    ; ESI - 存放SEC代码的入口
    ; EBP - 存放BFV的起始地址

%ifdef ARCH_IA32

    mov     eax, esp                    ; 恢复EAX寄存器的初始值
    jmp     esi                         ; 跳转到32-位的SEC入口

%endif
```

复位向量的核心任务：16位真实方式初始化、切换操作方式、定位BFV基址，以及定位SEC代码。

### 3. 刻意规划

复位向量所指的位置是ROM顶部减去16个字节的位置。该位置本没有代码，刻意规划之后便有了代码，哈哈！

```nasm
BITS    16

%ifdef ALIGN_TOP_TO_4K_FOR_PAGING
    TIMES (0x1000 - ($ - EndOfPageTables) - 0x20) DB 0
%endif

ALIGN   16    ; 应用处理器初始化的入口(0xffffffe0）

ApplicationProcessorEntryPoint:
    jmp     ApInitReal16

ALIGN   8

WhoSignature:
    DB      'D', 'B', 'G', 0
VtfSignature:
    DB      'V', 'T', 'F', 0

ALIGN   16    ; 引导处理器初始化的入口(0xfffffff0）

ResetVector:  ; 复位向量，处理器执行的第一条指令
; 此时，CS.BA = 0xFFFF0000，EIP = FFF0，因此第一条指令位置 = CS.BA + EIP = 0xFFFFFFF0
; 而CS.SR = F000, CS.SR会保持初始值，直到代码由重新初始化为止
    nop
    nop
    jmp     BspInitReal16

ALIGN   16

TopOf4GiB:
```

刻意规划之后，第一条指令即`jmp BspInitReal16`。复位向量驱动使用汇编编写，编译生成的代码为.bin文件，将集成到`[FV.SECFV]`中，然后烧录到ROM的顶部。因此，在系统上电之初，第一条指令就可以在复位向量`ResetVector:`的地方执行了。
