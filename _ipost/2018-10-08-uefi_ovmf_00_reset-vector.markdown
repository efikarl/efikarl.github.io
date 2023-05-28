---
title   : "UEFI - 复位向量"
layout  : post
date    : 2018-10-08 10:35:52 +800
tags    : uefi.reset-vector
---
### 1. 需求分析

​复位向量指向计算机上电后运行的第一条指令。该驱动的目标是，接管来自复位向量的计算机控制权，最终传给SEC核心。

#### 1.1 关键概念

##### 1.1.1 复位向量

在X64架构中，系统一上电，BSP便从复位向量处执行第一条指令。此时，CS.BA = 0xFFFF0000，EIP = FFF0，因此第一条指令位置 = CS.BA + EIP = 0xFFFFFFF0。而CS.SR = F000，CS.SR会保持初始值，直到代码由重新初始化为止。[^1]

##### 1.1.2 操作方式

我们知道，在X64架构中，系统一上电，CPU首先处于真实方式下。真实方式对系统资源的使用能力有限且效率低下，因此我们需要将操作方式从真实方式切换到保护方式。

保护方式分为：分段保护方式和平面保护方式。我们希望BIOS工作在平面保护方式下，此时，有效地址与虚拟地址一一映射。并且因为我们没有使能分页技术，那么，有效地址就与物理地址就一一映射了。[^2]

#### 1.2 消费清单

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
  KarlPkg/KarlPkg.dec             # 提供fdf中需要一些变量的声明
  MdePkg/MdePkg.dec
  MdeModulePkg/MdeModulePkg.dec

[BuildOptions]
  *_*_IA32_NASMB_FLAGS = -I$(WORKSPACE)/KarlPkg/ResetVector/
```

此外，FDF文件也是该驱动的重要消费清单之一。因为FDF会决定BIOS驱动在NVRAM中的布局，而该驱动的布局位置，需要处于复位向量可及的范围。

#### 1.3 任务清单

- 规划复位向量
- 切换操作方式
- 定位BFV基址
- 定位SEC核心

#### 1.4 生成清单

##### 1.4.1 参数传递

- BVF的基址

##### 1.4.2 标准数据

- 空

##### 1.4.3 标准接口

- 空

##### 1.4.4 硬件控制

- 处理器的BIST
- 处理器的操作方式：真实方式=>保护方式

### 2. 业务逻辑

在深入业务分支之前，我们先预览一下驱动的主体逻辑如下：

```nasm
BITS    16

MainRoutine16:
    OneTimeCall InitReal16
    OneTimeCall TransitionFromReal16ToFlat32

BITS    32

    OneTimeCall Flat32SearchForBfvBase
    ; EBP - 存放BFV的起始地址

    OneTimeCall Flat32SearchForSecCoreEntryPoint
    ; ESI - 存放SEC核心的入口
    ; EBP - 存放BFV的起始地址

%ifdef ARCH_IA32

    mov     eax, esp                    ; 恢复EAX寄存器的初始值
    jmp     esi                         ; 跳转到32-位的SEC入口

%endif
```

主体逻辑从宏观上描绘了复位向量的核心任务，以便我们有一个全面的了解。清晰可见，复位向量的核心任务就是，16位真实方式初始化、切换操作方式、定位BFV基址，以及定位SEC核心。

#### 2.1 规划复位向量

复位向量需要规划吗？答案是肯定的。虽然在硬件上，复位向量有一个明确的初始地址，但在初始地址处并没有任何代码存在。因此，我们需要为复位向量设计代码。

此外，相信熟悉EDKII架构的朋友可能有些疑惑，INF文件中没有描述入口函数，程序从哪里执行呢？聪明的你可能也知道答案：复位向量。那么复位向量代码长什么样子呢？请看下列代码：

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
    DB      'L', 'Y', 'K', 0
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

复位向量所指的位置即代码的`ResetVector:`位置，又有人会感叹了：怎么那么巧。无巧不成书嘛！哈哈～，开玩笑。事实上这是我们刻意为之，我们将代码构造在了复位向量所指的位置。复位向量驱动代码使用汇编编写，编译生成的代码为.bin文件。复位向量的实现恰恰被在安排在了.bin文件的顶部，而.bin文件又会被烧录到NVRAM的顶部。如此一来，在系统上电之初，第一条指令就可以在复位向量`ResetVector:`的地方执行了。

#### 2.2 切换操作方式

复位向量通过两次跳转指令，最终跳到了主体逻辑中所见的`MainRoutine16`。在执行完16位真实方式初始化后，便是处理器操作方式的切换了。关键代码如下：

```nasm
BITS    16

TransitionFromReal16ToFlat32:
    DebugShowPostCode POSTCODE_16BIT_MODE
    cli                                 ; 清中断
    ; 装载GDTR
    mov     bx, cs
    mov     ds, bx
    mov     bx, ADDR16_OF(gdtr)
o32 lgdt    [cs:bx]
    ; 设置CR0：PE
    mov     eax , cr0 
    or      eax , 1
    mov     cr0 , eax
    ; 跳转至32位代码处
    jmp LINEAR_CODE32_SEL:dword ADDR_OF(JumpTo32BitAndLandHere)

BITS    32

JumpTo32BitAndLandHere:                 ; 32位代码开始位置
    DebugShowPostCode POSTCODE_32BIT_MODE
    mov     ax, LINEAR_DATA32_SEL       ; 将所有段基址初始化为LINEAR_DATA32_SEL
    mov     ds, ax
    mov     es, ax
    mov     fs, ax
    mov     gs, ax
    mov     ss, ax
    OneTimeCallRet TransitionFromReal16ToFlat32
```

操作方式从16位真实方式切换到了32位保护方式。首先，关闭中断。接着，加载全局描述符表。然后，配置CR0寄存器（保护方式）。最后，跳转到32位代码处，并初始化了所有数据段寄存器。

#### 2.3 定位BFV基址与定位SEC核心

BIOS所有驱动程序，含复位向量驱动本身，都存放于NVRAM里，NVRAM使用固件文件系统（FFS）管理。SEC核心驱动亦然。因此，为了查找到SEC核心驱动文件，可先查找固件文卷（FV）。固件文卷位于4KiB对齐的边界上。[^3]

 在我们的设计中，SEC核心驱动文件处于`[FV.SECFV]`之中，`[FV.SECFV]`即NVRAM顶部的第一个文卷，因此自顶向下查找到第一个FV便是我们的`[FV.SECFV]`。原因嘛，别忘了复位向量驱动本身也处于该FV之中，且复位向量驱动为VTF文件，就是使得复位向量驱动适得其所啦。

对于BFV基址和SEC核心的定位。相信对熟悉PI规范第三卷的人来说就是小菜一碟了。对此，只一笔点过，不多赘述了。总之，你需要知道，在我们一系列平凡的操作之后，我们发现了SEC核心的入口函数，并执行了该入口函数。

### 3. 数据结构

- 空

### 4. 接口设计

- 空

### 5. 参考文献

[^1]: AAPM - V2: System Programming - 14.1 Processor Initialization.
[^2]: AAPM - V2: System Programming - 1.2 Memory Management.
[^3]: PI - V3: Platform Initialization Shared Architectural Elements.
