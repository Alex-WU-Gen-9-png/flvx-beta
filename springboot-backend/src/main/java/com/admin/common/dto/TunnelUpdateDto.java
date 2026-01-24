package com.admin.common.dto;

import com.admin.entity.ChainTunnel;
import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.TableField;
import lombok.Data;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Min;
import javax.validation.constraints.Max;
import javax.validation.constraints.DecimalMin;
import javax.validation.constraints.DecimalMax;
import java.math.BigDecimal;
import java.util.List;

@Data
public class TunnelUpdateDto {

    @NotNull(message = "隧道ID不能为空")
    private Long id;

    @NotBlank(message = "隧道名称不能为空")
    private String name;

    @NotNull(message = "流量计算类型不能为空")
    private Integer flow;

    private String inIp;

    @DecimalMin(value = "0.0", inclusive = false, message = "流量倍率必须大于0.0")
    @DecimalMax(value = "100.0", message = "流量倍率不能大于100.0")
    private BigDecimal trafficRatio;

    // 入口节点配置（可选，为空时不更新节点配置）
    private List<ChainTunnel> inNodeId;

    // 转发链节点配置（二维数组，每一跳可有多个节点）
    private List<List<ChainTunnel>> chainNodes;

    // 出口节点配置
    private List<ChainTunnel> outNodeId;
}