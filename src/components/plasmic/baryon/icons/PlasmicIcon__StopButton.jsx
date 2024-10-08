// @ts-nocheck
/* eslint-disable */
/* tslint:disable */
/* prettier-ignore-start */
import React from "react";
import { classNames } from "@plasmicapp/react-web";

export function StopButtonIcon(props) {
  const { className, style, title, ...restProps } = props;
  return (
    <svg
      xmlns={"http://www.w3.org/2000/svg"}
      fill={"currentColor"}
      version={"1.1"}
      viewBox={"0 0 297 297"}
      xmlSpace={"preserve"}
      height={"1em"}
      className={classNames("plasmic-default__svg", className)}
      style={style}
      {...restProps}
    >
      {title && <title>{title}</title>}

      <path
        d={
          "M148.5 0C66.486 0 0 66.486 0 148.5S66.486 297 148.5 297 297 230.514 297 148.5 230.514 0 148.5 0zm64.792 190.121c0 12.912-10.467 23.379-23.378 23.379H106.67c-12.911 0-23.378-10.467-23.378-23.379v-83.242c0-12.912 10.467-23.379 23.378-23.379h83.244c12.911 0 23.378 10.467 23.378 23.379v83.242z"
        }
      ></path>
    </svg>
  );
}

export default StopButtonIcon;
/* prettier-ignore-end */
