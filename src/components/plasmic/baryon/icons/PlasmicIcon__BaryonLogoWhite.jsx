// @ts-nocheck
/* eslint-disable */
/* tslint:disable */
/* prettier-ignore-start */
import React from "react";
import { classNames } from "@plasmicapp/react-web";

export function BaryonLogoWhiteIcon(props) {
  const { className, style, title, ...restProps } = props;
  return (
    <svg
      xmlns={"http://www.w3.org/2000/svg"}
      fill={"none"}
      viewBox={"0 0 32 27"}
      height={"1em"}
      className={classNames("plasmic-default__svg", className)}
      style={style}
      {...restProps}
    >
      {title && <title>{title}</title>}

      <g
        clipPath={"url(#0mGA2vTJeD2ma)"}
        fillRule={"evenodd"}
        clipRule={"evenodd"}
        fill={"currentColor"}
      >
        <path
          d={
            "M31.422.163C24.983 1.17 20.057 6.74 20.057 13.462c0 6.72 4.925 12.29 11.362 13.299-.683.107-1.384.162-2.097.162-7.434 0-13.461-6.027-13.461-13.461C15.86 6.027 21.886 0 29.322 0c.714 0 1.416.056 2.1.163zM0 .163C6.439 1.17 11.364 6.74 11.364 13.462c0 6.72-4.924 12.29-11.361 13.299.683.107 1.383.162 2.097.162 7.434 0 13.461-6.027 13.461-13.461C15.561 6.027 9.534 0 2.1 0 1.386 0 .684.056 0 .163z"
          }
        ></path>
      </g>

      <defs>
        <clipPath id={"0mGA2vTJeD2ma"}>
          <path fill={"currentColor"} d={"M0 0h31.432v26.923H0z"}></path>
        </clipPath>
      </defs>
    </svg>
  );
}

export default BaryonLogoWhiteIcon;
/* prettier-ignore-end */
