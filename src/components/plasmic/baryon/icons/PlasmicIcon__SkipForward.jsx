// @ts-nocheck
/* eslint-disable */
/* tslint:disable */
/* prettier-ignore-start */
import React from "react";
import { classNames } from "@plasmicapp/react-web";

export function SkipForwardIcon(props) {
  const { className, style, title, ...restProps } = props;
  return (
    <svg
      xmlns={"http://www.w3.org/2000/svg"}
      fill={"none"}
      viewBox={"0 0 15 12"}
      height={"1em"}
      className={classNames("plasmic-default__svg", className)}
      style={style}
      {...restProps}
    >
      {title && <title>{title}</title>}

      <path
        d={"M12.6 5.775l-9.45 5.001V.774l9.45 5.001z"}
        fill={"currentColor"}
      ></path>

      <path
        d={"M13.6 0v11.55"}
        stroke={"currentColor"}
        strokeWidth={"1.05"}
      ></path>
    </svg>
  );
}

export default SkipForwardIcon;
/* prettier-ignore-end */
